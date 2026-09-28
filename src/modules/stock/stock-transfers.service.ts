import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  DocumentType,
  LocationType,
  Prisma,
  StockMovementType,
  StockTransferStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { Paginated } from '../../common/types/paginated.type';
import { SequencesService } from '../sequences/sequences.service';
import { AuditService } from '../audit/audit.service';
import { StockService } from './stock.service';
import {
  isPlatformAdmin,
  type AuthenticatedUser,
} from '../auth/interfaces/authenticated-user.interface';
import {
  CreateStockTransferDto,
  QueryStockTransferDto,
  StockTransferResponseDto,
} from './dto/stock-transfer.dto';

const ST_INCLUDE = {
  lines: { orderBy: { lineNo: 'asc' as const } },
} satisfies Prisma.StockTransferInclude;

const round = (n: number, dp: number): number => {
  const f = 10 ** dp;
  return Math.round((n + Number.EPSILON) * f) / f;
};

@Injectable()
export class StockTransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequences: SequencesService,
    private readonly audit: AuditService,
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

  /** Create a DRAFT transfer. Quantities are converted to the item base UoM. */
  async create(
    dto: CreateStockTransferDto,
    caller: AuthenticatedUser,
  ): Promise<StockTransferResponseDto> {
    const companyId = this.resolveCompanyId(dto.companyId, caller);
    const transferDate = this.parseDate(dto.transferDate);

    const transfer = await this.prisma.$transaction(async (tx) => {
      const from = await this.assertInternalLocation(
        tx,
        dto.fromLocationId,
        companyId,
      );
      const to = await this.assertInternalLocation(
        tx,
        dto.toLocationId,
        companyId,
      );
      if (from.id === to.id) {
        throw new BadRequestException({
          code: 'TRANSFER_SAME_LOCATION',
          message: 'Source and destination locations must differ.',
          field: 'toLocationId',
        });
      }

      const builtLines: {
        itemId: string;
        variantId: string | null;
        uomId: string | null;
        qty: number;
      }[] = [];
      for (const line of dto.lines) {
        const { itemId, variantId } = await this.resolveItemVariant(
          tx,
          companyId,
          line.itemId,
          line.variantId,
        );
        const qty = await this.stock.convertQtyToBase(
          tx,
          companyId,
          itemId,
          line.uomId,
          line.qty,
        );
        builtLines.push({
          itemId,
          variantId,
          uomId: line.uomId ?? null,
          qty: round(qty, 3),
        });
      }

      const transferNo = await this.sequences.nextNumber(
        companyId,
        from.branchId ?? null,
        DocumentType.STOCK_TRANSFER,
        transferDate,
        tx,
      );

      return tx.stockTransfer.create({
        data: {
          companyId,
          transferNo,
          status: StockTransferStatus.DRAFT,
          transferDate,
          fromLocationId: from.id,
          toLocationId: to.id,
          fromBranchId: from.branchId,
          toBranchId: to.branchId,
          notes: dto.notes ?? null,
          createdBy: caller.userId,
          lines: {
            create: builtLines.map((l, i) => ({
              companyId,
              lineNo: i + 1,
              itemId: l.itemId,
              variantId: l.variantId,
              uomId: l.uomId,
              qty: new Prisma.Decimal(l.qty),
            })),
          },
        },
        include: ST_INCLUDE,
      });
    });
    return StockTransferResponseDto.fromEntity(transfer);
  }

  /** Optional approval step: DRAFT → APPROVED. */
  async approve(
    id: string,
    caller: AuthenticatedUser,
  ): Promise<StockTransferResponseDto> {
    const existing = await this.getOwned(id, caller);
    if (existing.status !== StockTransferStatus.DRAFT) {
      throw new ConflictException({
        code: 'TRANSFER_NOT_DRAFT',
        message: `Only a DRAFT transfer can be approved (this one is ${existing.status}).`,
        field: null,
      });
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      await this.audit.record(
        {
          action: AuditAction.CONFIRM,
          entity: 'StockTransfer',
          entityId: existing.id,
          companyId: existing.companyId,
          userId: caller.userId,
          after: { transferNo: existing.transferNo, status: 'APPROVED' },
        },
        tx,
      );
      return tx.stockTransfer.update({
        where: { id: existing.id },
        data: {
          status: StockTransferStatus.APPROVED,
          approvedById: caller.userId,
          approvedAt: new Date(),
        },
        include: ST_INCLUDE,
      });
    });
    return StockTransferResponseDto.fromEntity(updated);
  }

  /**
   * Post the transfer: each line moves as ONE value-neutral internal TRANSFER
   * movement from the source to the destination location. No journal entry — the
   * moving average and total inventory value are unchanged. Allowed from DRAFT or
   * APPROVED (approval is optional).
   */
  async post(
    id: string,
    caller: AuthenticatedUser,
  ): Promise<StockTransferResponseDto> {
    const existing = await this.getOwned(id, caller);
    if (
      existing.status !== StockTransferStatus.DRAFT &&
      existing.status !== StockTransferStatus.APPROVED
    ) {
      throw new ConflictException({
        code: 'TRANSFER_NOT_POSTABLE',
        message: `Only a DRAFT or APPROVED transfer can be posted (this one is ${existing.status}).`,
        field: null,
      });
    }

    const transfer = await this.prisma.$transaction(async (tx) => {
      const companyId = existing.companyId;
      const dateStr = existing.transferDate.toISOString().slice(0, 10);

      for (const line of existing.lines) {
        const movement = await this.stock.postMovementInTx(
          tx,
          {
            type: StockMovementType.TRANSFER,
            movementDate: dateStr,
            itemId: line.itemId,
            variantId: line.variantId ?? undefined,
            fromLocationId: existing.fromLocationId,
            toLocationId: existing.toLocationId,
            qty: Number(line.qty),
            // qty already in base units — do NOT pass uomId (no reconvert).
            reference: existing.transferNo,
            sourceDocType: DocumentType.STOCK_TRANSFER,
            sourceDocId: existing.id,
            companyId,
          },
          caller,
        );
        await tx.stockTransferLine.update({
          where: { id: line.id },
          data: { stockMovementId: movement.id },
        });
      }

      await this.audit.record(
        {
          action: AuditAction.POST,
          entity: 'StockTransfer',
          entityId: existing.id,
          companyId,
          userId: caller.userId,
          after: { transferNo: existing.transferNo, status: 'POSTED' },
        },
        tx,
      );

      return tx.stockTransfer.update({
        where: { id: existing.id },
        data: { status: StockTransferStatus.POSTED, postedAt: new Date() },
        include: ST_INCLUDE,
      });
    });
    return StockTransferResponseDto.fromEntity(transfer);
  }

  async findAll(
    query: QueryStockTransferDto,
    caller: AuthenticatedUser,
  ): Promise<Paginated<StockTransferResponseDto>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.StockTransferWhereInput = { deletedAt: null };
    if (query.companyId) where.companyId = query.companyId;
    if (query.status) where.status = query.status;
    const client = this.clientFor(caller);
    const [rows, total] = await this.prisma.$transaction([
      client.stockTransfer.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: ST_INCLUDE,
      }),
      client.stockTransfer.count({ where }),
    ]);
    return Paginated.of(
      rows.map(StockTransferResponseDto.fromEntity),
      total,
      page,
      limit,
    );
  }

  async findOne(
    id: string,
    caller: AuthenticatedUser,
  ): Promise<StockTransferResponseDto> {
    return StockTransferResponseDto.fromEntity(await this.getOwned(id, caller));
  }

  async remove(id: string, caller: AuthenticatedUser): Promise<void> {
    const existing = await this.getOwned(id, caller);
    if (existing.status === StockTransferStatus.POSTED) {
      throw new ConflictException({
        code: 'TRANSFER_POSTED',
        message: 'A posted transfer cannot be deleted.',
        field: null,
      });
    }
    await this.clientFor(caller).stockTransfer.update({
      where: { id },
      data: { deletedAt: new Date(), status: StockTransferStatus.CANCELLED },
    });
  }

  // --- helpers -------------------------------------------------------------

  private async getOwned(id: string, caller: AuthenticatedUser) {
    const transfer = await this.clientFor(caller).stockTransfer.findFirst({
      where: { id, deletedAt: null },
      include: ST_INCLUDE,
    });
    if (!transfer) {
      throw new NotFoundException({
        code: 'STOCK_TRANSFER_NOT_FOUND',
        message: `Stock transfer ${id} was not found.`,
        field: null,
      });
    }
    return transfer;
  }

  private async resolveItemVariant(
    tx: Prisma.TransactionClient,
    companyId: string,
    itemId: string,
    variantId: string | undefined,
  ): Promise<{ itemId: string; variantId: string | null }> {
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
    return { itemId: item.id, variantId: variantId ?? null };
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
        message: 'Both transfer locations must be internal locations.',
        field: 'fromLocationId',
      });
    }
    return loc;
  }

  private parseDate(value: string | undefined): Date {
    if (!value) return new Date();
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException({
        code: 'INVALID_DATE',
        message: `"${value}" is not a valid date.`,
        field: 'transferDate',
      });
    }
    return d;
  }
}
