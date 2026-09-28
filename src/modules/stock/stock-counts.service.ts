import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  ControlType,
  DocumentType,
  JournalSide,
  JournalStatus,
  LocationType,
  Prisma,
  StockCountStatus,
  StockMovementType,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { Paginated } from '../../common/types/paginated.type';
import { SequencesService } from '../sequences/sequences.service';
import { AuditService } from '../audit/audit.service';
import { FiscalPeriodsService } from '../fiscal-periods/fiscal-periods.service';
import { StockService } from './stock.service';
import {
  isPlatformAdmin,
  type AuthenticatedUser,
} from '../auth/interfaces/authenticated-user.interface';
import {
  CreateStockCountDto,
  QueryStockCountDto,
  StockCountResponseDto,
} from './dto/stock-count.dto';

const SC_INCLUDE = {
  lines: { orderBy: { lineNo: 'asc' as const } },
} satisfies Prisma.StockCountInclude;

const round = (n: number, dp: number): number => {
  const f = 10 ** dp;
  return Math.round((n + Number.EPSILON) * f) / f;
};

@Injectable()
export class StockCountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequences: SequencesService,
    private readonly audit: AuditService,
    private readonly fiscalPeriods: FiscalPeriodsService,
    private readonly stock: StockService,
  ) {}

  private clientFor(caller: AuthenticatedUser): Prisma.TransactionClient {
    if (isPlatformAdmin(caller)) return this.prisma;
    return this.prisma.forTenant(
      caller.companyId as string,
    ) as unknown as Prisma.TransactionClient;
  }

  private resolveCompanyId(
    dtoCompanyId: string | undefined,
    caller: AuthenticatedUser,
  ): string {
    if (!isPlatformAdmin(caller)) {
      if (!caller.companyId) {
        throw new BadRequestException({
          code: 'COMPANY_CONTEXT_REQUIRED',
          message: 'No active company selected.',
          field: null,
        });
      }
      return caller.companyId;
    }
    if (!dtoCompanyId) {
      throw new BadRequestException({
        code: 'COMPANY_ID_REQUIRED',
        message: 'A platform admin must specify companyId.',
        field: 'companyId',
      });
    }
    return dtoCompanyId;
  }

  /**
   * Create a DRAFT count: snapshot the current on-hand per line and record the
   * counted quantity (converted to the item base UoM). Nothing posts yet.
   */
  async create(
    dto: CreateStockCountDto,
    caller: AuthenticatedUser,
  ): Promise<StockCountResponseDto> {
    const companyId = this.resolveCompanyId(dto.companyId, caller);
    const countDate = this.parseDate(dto.countDate);

    const count = await this.prisma.$transaction(async (tx) => {
      const location = await this.assertInternalLocation(
        tx,
        dto.locationId,
        companyId,
      );
      if (dto.branchId) await this.assertBranch(tx, dto.branchId, companyId);

      const builtLines: {
        itemId: string;
        variantId: string | null;
        uomId: string | null;
        systemQty: number;
        countedQty: number;
        unitCost: number | null;
      }[] = [];
      for (const line of dto.lines) {
        const { item, variantId } = await this.resolveItemVariant(
          tx,
          companyId,
          line.itemId,
          line.variantId,
        );
        const systemQty = await this.stock.locationOnHandFor(
          tx,
          companyId,
          item.id,
          variantId,
          location.id,
        );
        const countedQty = await this.stock.convertQtyToBase(
          tx,
          companyId,
          item.id,
          line.uomId,
          line.countedQty,
        );
        builtLines.push({
          itemId: item.id,
          variantId,
          uomId: line.uomId ?? null,
          systemQty: round(systemQty, 3),
          countedQty: round(countedQty, 3),
          unitCost: line.unitCost ?? null,
        });
      }

      const countNo = await this.sequences.nextNumber(
        companyId,
        dto.branchId ?? null,
        DocumentType.STOCK_COUNT,
        countDate,
        tx,
      );

      return tx.stockCount.create({
        data: {
          companyId,
          countNo,
          status: StockCountStatus.DRAFT,
          countDate,
          branchId: dto.branchId ?? null,
          locationId: location.id,
          notes: dto.notes ?? null,
          createdBy: caller.userId,
          lines: {
            create: builtLines.map((l, i) => ({
              companyId,
              lineNo: i + 1,
              itemId: l.itemId,
              variantId: l.variantId,
              uomId: l.uomId,
              systemQty: new Prisma.Decimal(l.systemQty),
              countedQty: new Prisma.Decimal(l.countedQty),
              unitCost:
                l.unitCost == null ? null : new Prisma.Decimal(l.unitCost),
            })),
          },
        },
        include: SC_INCLUDE,
      });
    });
    return StockCountResponseDto.fromEntity(count);
  }

  /**
   * Post a DRAFT count. For each line the variance is recomputed against the
   * CURRENT on-hand (not the stale snapshot), an ADJUSTMENT movement is posted
   * for it, and the whole count posts ONE balanced journal entry — net variance
   * value between Inventory (control INVENTORY) and the inventory-variance
   * account (control INVENTORY_ADJUSTMENT). All atomic.
   */
  async post(
    id: string,
    caller: AuthenticatedUser,
  ): Promise<StockCountResponseDto> {
    const existing = await this.getOwned(id, caller);
    if (existing.status !== StockCountStatus.DRAFT) {
      throw new ConflictException({
        code: 'COUNT_NOT_DRAFT',
        message: `Only a DRAFT stock count can be posted (this one is ${existing.status}).`,
        field: null,
      });
    }

    const count = await this.prisma.$transaction(async (tx) => {
      const companyId = existing.companyId;
      // FR-904: block posting into a locked fiscal period.
      await this.fiscalPeriods.assertOpen(companyId, existing.countDate, tx);

      const adjustment = await this.virtualLocation(
        tx,
        companyId,
        LocationType.ADJUSTMENT,
      );
      const dateStr = existing.countDate.toISOString().slice(0, 10);

      let netInventory = 0;
      for (const line of existing.lines) {
        const current = await this.stock.locationOnHandFor(
          tx,
          companyId,
          line.itemId,
          line.variantId,
          existing.locationId,
        );
        const delta = round(Number(line.countedQty) - current, 3);
        if (delta === 0) {
          await tx.stockCountLine.update({
            where: { id: line.id },
            data: { varianceQty: new Prisma.Decimal(0) },
          });
          continue;
        }

        const up = delta > 0;
        const avg = await this.currentAvg(tx, line.itemId, line.variantId);
        const movement = await this.stock.postMovementInTx(
          tx,
          {
            type: StockMovementType.ADJUSTMENT,
            movementDate: dateStr,
            itemId: line.itemId,
            variantId: line.variantId ?? undefined,
            fromLocationId: up ? adjustment.id : existing.locationId,
            toLocationId: up ? existing.locationId : adjustment.id,
            qty: Math.abs(delta),
            // delta is already in base units — do NOT pass uomId (no reconvert).
            unitCost: up
              ? line.unitCost != null
                ? Number(line.unitCost)
                : avg
              : undefined,
            reason: `Stock count ${existing.countNo}`,
            reference: existing.countNo,
            branchId: existing.branchId ?? undefined,
            sourceDocType: DocumentType.STOCK_COUNT,
            sourceDocId: existing.id,
            companyId,
          },
          caller,
        );

        const signedValue = round(
          up ? Number(movement.value) : -Number(movement.value),
          4,
        );
        netInventory = round(netInventory + signedValue, 4);
        await tx.stockCountLine.update({
          where: { id: line.id },
          data: {
            varianceQty: new Prisma.Decimal(delta),
            varianceValueBase: new Prisma.Decimal(signedValue),
            stockMovementId: movement.id,
          },
        });
      }

      let journalEntryId: string | null = null;
      if (netInventory !== 0) {
        const baseCurrency = await this.baseCurrencyOf(tx, companyId);
        const inventoryAcc = await this.controlAccount(
          tx,
          companyId,
          ControlType.INVENTORY,
          'INVENTORY_ACCOUNT_MISSING',
        );
        const adjustmentAcc = await this.controlAccount(
          tx,
          companyId,
          ControlType.INVENTORY_ADJUSTMENT,
          'INVENTORY_ADJUSTMENT_ACCOUNT_MISSING',
        );
        const mag = Math.abs(netInventory);
        // Stock up (net>0) → asset up: DR inventory, CR variance (a gain).
        // Stock down (net<0) → asset down: DR variance (a loss), CR inventory.
        const inventorySide =
          netInventory > 0 ? JournalSide.DEBIT : JournalSide.CREDIT;
        const varianceSide =
          netInventory > 0 ? JournalSide.CREDIT : JournalSide.DEBIT;

        const mkLine = (
          accountId: string,
          side: JournalSide,
          lineNo: number,
        ): Prisma.JournalLineCreateManyJournalEntryInput => ({
          companyId,
          lineNo,
          accountId,
          side,
          amountOriginal: new Prisma.Decimal(mag),
          currency: baseCurrency,
          rate: new Prisma.Decimal(1),
          amountBase: new Prisma.Decimal(mag),
          baseCurrencyCode: baseCurrency,
        });

        const entryNumber = await this.sequences.nextNumber(
          companyId,
          existing.branchId,
          DocumentType.JOURNAL_ENTRY,
          existing.countDate,
          tx,
        );
        const entry = await tx.journalEntry.create({
          data: {
            companyId,
            branchId: existing.branchId,
            entryNumber,
            date: existing.countDate,
            reference: existing.countNo,
            description: `Stock count ${existing.countNo}`,
            status: JournalStatus.POSTED,
            sourceDocType: DocumentType.STOCK_COUNT,
            sourceDocId: existing.id,
            postedAt: new Date(),
            postedById: caller.userId,
            createdById: caller.userId,
            lines: {
              createMany: {
                data: [
                  mkLine(inventoryAcc.id, inventorySide, 1),
                  mkLine(adjustmentAcc.id, varianceSide, 2),
                ],
              },
            },
          },
        });
        journalEntryId = entry.id;
      }

      await this.audit.record(
        {
          action: AuditAction.POST,
          entity: 'StockCount',
          entityId: existing.id,
          companyId,
          userId: caller.userId,
          after: {
            countNo: existing.countNo,
            varianceValueBase: netInventory,
            journalEntryId,
          },
        },
        tx,
      );

      return tx.stockCount.update({
        where: { id: existing.id },
        data: {
          status: StockCountStatus.POSTED,
          journalEntryId,
          postedAt: new Date(),
          varianceValueBase: new Prisma.Decimal(netInventory),
        },
        include: SC_INCLUDE,
      });
    });
    return StockCountResponseDto.fromEntity(count);
  }

  async findAll(
    query: QueryStockCountDto,
    caller: AuthenticatedUser,
  ): Promise<Paginated<StockCountResponseDto>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.StockCountWhereInput = { deletedAt: null };
    if (query.companyId) where.companyId = query.companyId;
    if (query.status) where.status = query.status;
    if (query.locationId) where.locationId = query.locationId;
    const client = this.clientFor(caller);
    const [rows, total] = await this.prisma.$transaction([
      client.stockCount.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: SC_INCLUDE,
      }),
      client.stockCount.count({ where }),
    ]);
    return Paginated.of(
      rows.map(StockCountResponseDto.fromEntity),
      total,
      page,
      limit,
    );
  }

  async findOne(
    id: string,
    caller: AuthenticatedUser,
  ): Promise<StockCountResponseDto> {
    return StockCountResponseDto.fromEntity(await this.getOwned(id, caller));
  }

  async remove(id: string, caller: AuthenticatedUser): Promise<void> {
    const existing = await this.getOwned(id, caller);
    if (existing.status === StockCountStatus.POSTED) {
      throw new ConflictException({
        code: 'COUNT_POSTED',
        message: 'A posted stock count cannot be deleted.',
        field: null,
      });
    }
    await this.clientFor(caller).stockCount.update({
      where: { id },
      data: { deletedAt: new Date(), status: StockCountStatus.CANCELLED },
    });
  }

  // --- helpers -------------------------------------------------------------

  private async getOwned(id: string, caller: AuthenticatedUser) {
    const count = await this.clientFor(caller).stockCount.findFirst({
      where: { id, deletedAt: null },
      include: SC_INCLUDE,
    });
    if (!count) {
      throw new NotFoundException({
        code: 'STOCK_COUNT_NOT_FOUND',
        message: `Stock count ${id} was not found.`,
        field: null,
      });
    }
    return count;
  }

  private async resolveItemVariant(
    tx: Prisma.TransactionClient,
    companyId: string,
    itemId: string,
    variantId: string | undefined,
  ): Promise<{ item: { id: string }; variantId: string | null }> {
    const item = await tx.item.findFirst({
      where: { id: itemId, companyId, deletedAt: null },
      select: { id: true, hasSize: true, hasColour: true },
    });
    if (!item) {
      throw new NotFoundException({
        code: 'ITEM_NOT_FOUND',
        message: `Item ${itemId} was not found in this company.`,
        field: 'itemId',
      });
    }
    const needsVariant = item.hasSize || item.hasColour;
    if (needsVariant && !variantId) {
      throw new BadRequestException({
        code: 'VARIANT_REQUIRED',
        message: 'This item has variants; a variantId is required.',
        field: 'variantId',
      });
    }
    if (!needsVariant && variantId) {
      throw new BadRequestException({
        code: 'ITEM_HAS_NO_VARIANTS',
        message: 'This item has no variants; do not pass a variantId.',
        field: 'variantId',
      });
    }
    if (variantId) {
      const variant = await tx.itemVariant.findFirst({
        where: { id: variantId, itemId: item.id },
        select: { id: true },
      });
      if (!variant) {
        throw new NotFoundException({
          code: 'VARIANT_NOT_FOUND',
          message: `Variant ${variantId} was not found on this item.`,
          field: 'variantId',
        });
      }
    }
    return { item: { id: item.id }, variantId: variantId ?? null };
  }

  private async currentAvg(
    tx: Prisma.TransactionClient,
    itemId: string,
    variantId: string | null,
  ): Promise<number> {
    if (variantId) {
      const v = await tx.itemVariant.findUnique({
        where: { id: variantId },
        select: { avgCost: true },
      });
      return Math.max(Number(v?.avgCost ?? 0), 0);
    }
    const i = await tx.item.findUnique({
      where: { id: itemId },
      select: { avgCost: true },
    });
    return Math.max(Number(i?.avgCost ?? 0), 0);
  }

  private async assertInternalLocation(
    tx: Prisma.TransactionClient,
    locationId: string,
    companyId: string,
  ) {
    const loc = await tx.location.findFirst({
      where: { id: locationId, companyId, deletedAt: null },
    });
    if (!loc || loc.type !== LocationType.INTERNAL) {
      throw new BadRequestException({
        code: 'LOCATION_INVALID',
        message: 'The counted location must be an internal location.',
        field: 'locationId',
      });
    }
    return loc;
  }

  private async assertBranch(
    tx: Prisma.TransactionClient,
    branchId: string,
    companyId: string,
  ): Promise<void> {
    const branch = await tx.branch.findFirst({
      where: { id: branchId, companyId, deletedAt: null },
    });
    if (!branch) {
      throw new NotFoundException({
        code: 'BRANCH_NOT_FOUND',
        message: `Branch ${branchId} was not found in this company.`,
        field: 'branchId',
      });
    }
  }

  private async virtualLocation(
    tx: Prisma.TransactionClient,
    companyId: string,
    type: LocationType,
  ) {
    const loc = await tx.location.findFirst({
      where: { companyId, type, deletedAt: null },
    });
    if (!loc) {
      throw new NotFoundException({
        code: 'VIRTUAL_LOCATION_MISSING',
        message: `No ${type} location is configured for this company.`,
        field: null,
      });
    }
    return loc;
  }

  private async controlAccount(
    tx: Prisma.TransactionClient,
    companyId: string,
    controlType: ControlType,
    missingCode: string,
  ) {
    const account = await tx.account.findFirst({
      where: { companyId, controlType, deletedAt: null },
    });
    if (!account) {
      throw new BadRequestException({
        code: missingCode,
        message: `No ${controlType} control account is configured for this company.`,
        field: null,
      });
    }
    return account;
  }

  private async baseCurrencyOf(
    tx: Prisma.TransactionClient,
    companyId: string,
  ): Promise<string> {
    const company = await tx.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { baseCurrencyCode: true },
    });
    return company.baseCurrencyCode;
  }

  private parseDate(value: string | undefined): Date {
    if (!value) return new Date();
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException({
        code: 'INVALID_DATE',
        message: `"${value}" is not a valid date.`,
        field: 'countDate',
      });
    }
    return d;
  }
}
