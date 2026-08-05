import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DocumentType,
  Prisma,
  PurchaseOrderStatus,
  TaxTreatment,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { Paginated } from '../../common/types/paginated.type';
import { SequencesService } from '../sequences/sequences.service';
import {
  isPlatformAdmin,
  type AuthenticatedUser,
} from '../auth/interfaces/authenticated-user.interface';
import {
  CreatePurchaseOrderDto,
  PurchaseOrderResponseDto,
  QueryPurchaseOrderDto,
  UpdatePurchaseOrderDto,
} from './dto/purchase-order.dto';
import {
  computeLine,
  computeTotals,
  toDecimal,
  type LineAmounts,
} from './purchasing.money';
import { resolveRate } from './purchasing.rate';
import { toPurchaseOrderResponse, PO_INCLUDE } from './purchasing.mappers';

interface BuiltLine {
  itemId: string;
  variantId: string | null;
  uomId: string;
  qtyOrdered: number;
  unitCost: number;
  taxRateId: string | null;
  vatTreatment: TaxTreatment;
  ratePct: number;
  amounts: LineAmounts;
  description: string | null;
}

@Injectable()
export class PurchaseOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequences: SequencesService,
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

  async create(
    dto: CreatePurchaseOrderDto,
    caller: AuthenticatedUser,
  ): Promise<PurchaseOrderResponseDto> {
    const companyId = this.resolveCompanyId(dto.companyId, caller);
    const orderDate = this.parseDate(dto.orderDate, 'orderDate');

    const po = await this.prisma.$transaction(async (tx) => {
      await this.assertSupplier(tx, dto.supplierId, companyId);
      if (dto.branchId) await this.assertBranch(tx, dto.branchId, companyId);
      const rate = await resolveRate(
        tx,
        companyId,
        dto.currencyCode,
        dto.rate,
        orderDate,
      );

      const lines = await this.buildLines(tx, companyId, dto.lines);
      const totals = computeTotals(
        lines.map((l) => l.amounts),
        rate,
      );
      const orderNo = await this.sequences.nextNumber(
        companyId,
        dto.branchId ?? null,
        DocumentType.PURCHASE_ORDER,
        orderDate,
        tx,
      );

      return tx.purchaseOrder.create({
        data: {
          companyId,
          orderNo,
          supplierId: dto.supplierId,
          branchId: dto.branchId ?? null,
          currencyCode: dto.currencyCode,
          rate: toDecimal(rate),
          orderDate,
          expectedDate: dto.expectedDate
            ? this.parseDate(dto.expectedDate, 'expectedDate')
            : null,
          notes: dto.notes ?? null,
          subtotal: toDecimal(totals.subtotal),
          vatTotal: toDecimal(totals.vatTotal),
          grandTotal: toDecimal(totals.grandTotal),
          subtotalBase: toDecimal(totals.subtotalBase),
          vatTotalBase: toDecimal(totals.vatTotalBase),
          grandTotalBase: toDecimal(totals.grandTotalBase),
          createdBy: caller.userId,
          lines: {
            create: lines.map((l, i) => ({
              companyId,
              lineNo: i + 1,
              itemId: l.itemId,
              variantId: l.variantId,
              uomId: l.uomId,
              qtyOrdered: toDecimal(l.qtyOrdered),
              unitCost: toDecimal(l.unitCost),
              taxRateId: l.taxRateId,
              vatTreatment: l.vatTreatment,
              ratePct: toDecimal(l.ratePct),
              netAmount: toDecimal(l.amounts.netAmount),
              vatAmount: toDecimal(l.amounts.vatAmount),
              totalAmount: toDecimal(l.amounts.totalAmount),
              description: l.description,
            })),
          },
        },
        include: PO_INCLUDE,
      });
    });
    return toPurchaseOrderResponse(po);
  }

  async findAll(
    query: QueryPurchaseOrderDto,
    caller: AuthenticatedUser,
  ): Promise<Paginated<PurchaseOrderResponseDto>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.PurchaseOrderWhereInput = { deletedAt: null };
    if (query.companyId) where.companyId = query.companyId;
    if (query.status) where.status = query.status;
    if (query.supplierId) where.supplierId = query.supplierId;
    const client = this.clientFor(caller);
    const [rows, total] = await this.prisma.$transaction([
      client.purchaseOrder.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: PO_INCLUDE,
      }),
      client.purchaseOrder.count({ where }),
    ]);
    return Paginated.of(rows.map(toPurchaseOrderResponse), total, page, limit);
  }

  async findOne(
    id: string,
    caller: AuthenticatedUser,
  ): Promise<PurchaseOrderResponseDto> {
    return toPurchaseOrderResponse(await this.getOwned(id, caller));
  }

  async update(
    id: string,
    dto: UpdatePurchaseOrderDto,
    caller: AuthenticatedUser,
  ): Promise<PurchaseOrderResponseDto> {
    const existing = await this.getOwned(id, caller);
    if (existing.status !== PurchaseOrderStatus.DRAFT) {
      throw new ConflictException({
        code: 'PO_NOT_EDITABLE',
        message: `Only a DRAFT purchase order can be edited (this one is ${existing.status}).`,
        field: null,
      });
    }
    const companyId = existing.companyId;
    const orderDate = dto.orderDate
      ? this.parseDate(dto.orderDate, 'orderDate')
      : existing.orderDate;

    const po = await this.prisma.$transaction(async (tx) => {
      if (dto.supplierId)
        await this.assertSupplier(tx, dto.supplierId, companyId);
      if (dto.branchId) await this.assertBranch(tx, dto.branchId, companyId);
      const currencyCode = dto.currencyCode ?? existing.currencyCode;
      const rate = await resolveRate(
        tx,
        companyId,
        currencyCode,
        dto.rate ?? Number(existing.rate),
        orderDate,
      );

      const data: Prisma.PurchaseOrderUpdateInput = {
        ...(dto.supplierId
          ? { supplier: { connect: { id: dto.supplierId } } }
          : {}),
        ...(dto.branchId !== undefined
          ? dto.branchId
            ? { branch: { connect: { id: dto.branchId } } }
            : { branch: { disconnect: true } }
          : {}),
        currency: { connect: { code: currencyCode } },
        rate: toDecimal(rate),
        orderDate,
        ...(dto.expectedDate !== undefined
          ? {
              expectedDate: dto.expectedDate
                ? this.parseDate(dto.expectedDate, 'expectedDate')
                : null,
            }
          : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      };

      // Replace lines only when a new set is supplied.
      if (dto.lines) {
        const lines = await this.buildLines(tx, companyId, dto.lines);
        const totals = computeTotals(
          lines.map((l) => l.amounts),
          rate,
        );
        await tx.purchaseOrderLine.deleteMany({
          where: { purchaseOrderId: id },
        });
        data.subtotal = toDecimal(totals.subtotal);
        data.vatTotal = toDecimal(totals.vatTotal);
        data.grandTotal = toDecimal(totals.grandTotal);
        data.subtotalBase = toDecimal(totals.subtotalBase);
        data.vatTotalBase = toDecimal(totals.vatTotalBase);
        data.grandTotalBase = toDecimal(totals.grandTotalBase);
        data.lines = {
          create: lines.map((l, i) => ({
            companyId,
            lineNo: i + 1,
            itemId: l.itemId,
            variantId: l.variantId,
            uomId: l.uomId,
            qtyOrdered: toDecimal(l.qtyOrdered),
            unitCost: toDecimal(l.unitCost),
            taxRateId: l.taxRateId,
            vatTreatment: l.vatTreatment,
            ratePct: toDecimal(l.ratePct),
            netAmount: toDecimal(l.amounts.netAmount),
            vatAmount: toDecimal(l.amounts.vatAmount),
            totalAmount: toDecimal(l.amounts.totalAmount),
            description: l.description,
          })),
        };
      }

      return tx.purchaseOrder.update({
        where: { id },
        data,
        include: PO_INCLUDE,
      });
    });
    return toPurchaseOrderResponse(po);
  }

  async confirm(
    id: string,
    caller: AuthenticatedUser,
  ): Promise<PurchaseOrderResponseDto> {
    const existing = await this.getOwned(id, caller);
    if (existing.status !== PurchaseOrderStatus.DRAFT) {
      throw new ConflictException({
        code: 'PO_NOT_DRAFT',
        message: `Only a DRAFT purchase order can be confirmed (this one is ${existing.status}).`,
        field: null,
      });
    }
    const po = await this.clientFor(caller).purchaseOrder.update({
      where: { id },
      data: { status: PurchaseOrderStatus.CONFIRMED },
      include: PO_INCLUDE,
    });
    return toPurchaseOrderResponse(po);
  }

  async cancel(
    id: string,
    caller: AuthenticatedUser,
  ): Promise<PurchaseOrderResponseDto> {
    const existing = await this.getOwned(id, caller);
    if (
      existing.status === PurchaseOrderStatus.RECEIVED ||
      existing.status === PurchaseOrderStatus.BILLED
    ) {
      throw new ConflictException({
        code: 'PO_NOT_CANCELLABLE',
        message: `A ${existing.status} purchase order cannot be cancelled.`,
        field: null,
      });
    }
    const po = await this.clientFor(caller).purchaseOrder.update({
      where: { id },
      data: { status: PurchaseOrderStatus.CANCELLED },
      include: PO_INCLUDE,
    });
    return toPurchaseOrderResponse(po);
  }

  async remove(id: string, caller: AuthenticatedUser): Promise<void> {
    const existing = await this.getOwned(id, caller);
    if (existing.status !== PurchaseOrderStatus.DRAFT) {
      throw new ConflictException({
        code: 'PO_NOT_DELETABLE',
        message:
          'Only a DRAFT purchase order can be deleted; cancel it instead.',
        field: null,
      });
    }
    await this.clientFor(caller).purchaseOrder.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  // --- helpers -------------------------------------------------------------

  private async getOwned(id: string, caller: AuthenticatedUser) {
    const po = await this.clientFor(caller).purchaseOrder.findFirst({
      where: { id, deletedAt: null },
      include: PO_INCLUDE,
    });
    if (!po) {
      throw new NotFoundException({
        code: 'PURCHASE_ORDER_NOT_FOUND',
        message: `Purchase order ${id} was not found.`,
        field: null,
      });
    }
    return po;
  }

  private async buildLines(
    tx: Prisma.TransactionClient,
    companyId: string,
    lines: CreatePurchaseOrderDto['lines'],
  ): Promise<BuiltLine[]> {
    const built: BuiltLine[] = [];
    for (const line of lines) {
      const item = await tx.item.findFirst({
        where: { id: line.itemId, companyId, deletedAt: null },
      });
      if (!item) {
        throw new NotFoundException({
          code: 'ITEM_NOT_FOUND',
          message: `Item ${line.itemId} was not found in this company.`,
          field: 'itemId',
        });
      }
      if ((item.hasSize || item.hasColour) && !line.variantId) {
        throw new BadRequestException({
          code: 'VARIANT_REQUIRED',
          message: `Item ${item.code} has variants; a variantId is required.`,
          field: 'variantId',
        });
      }
      if (line.variantId) {
        const variant = await tx.itemVariant.findFirst({
          where: { id: line.variantId, itemId: item.id },
        });
        if (!variant) {
          throw new NotFoundException({
            code: 'VARIANT_NOT_FOUND',
            message: `Variant ${line.variantId} was not found on this item.`,
            field: 'variantId',
          });
        }
      }
      const uomId = line.uomId ?? item.purchaseUomId ?? item.baseUomId;
      const uom = await tx.uom.findFirst({ where: { id: uomId, companyId } });
      if (!uom) {
        throw new NotFoundException({
          code: 'UOM_NOT_FOUND',
          message: `UoM ${uomId} was not found in this company.`,
          field: 'uomId',
        });
      }

      // VAT snapshot from the item defaults, overridable per line.
      const vatTreatment = item.vatTreatment;
      const taxRateId = line.taxRateId ?? item.defaultTaxRateId ?? null;
      let ratePct = 0;
      if (vatTreatment === TaxTreatment.STANDARD && taxRateId) {
        const taxRate = await tx.taxRate.findFirst({
          where: { id: taxRateId, companyId },
        });
        if (!taxRate) {
          throw new NotFoundException({
            code: 'TAX_RATE_NOT_FOUND',
            message: `Tax rate ${taxRateId} was not found in this company.`,
            field: 'taxRateId',
          });
        }
        ratePct = Number(taxRate.ratePct);
      }
      // Default the cost from the item when the caller didn't negotiate one.
      const unitCost = line.unitCost ?? Number(item.costPrice);
      const amounts = computeLine({
        qty: line.qtyOrdered,
        unitCost,
        vatTreatment,
        ratePct,
      });
      built.push({
        itemId: item.id,
        variantId: line.variantId ?? null,
        uomId,
        qtyOrdered: line.qtyOrdered,
        unitCost,
        taxRateId: vatTreatment === TaxTreatment.STANDARD ? taxRateId : null,
        vatTreatment,
        ratePct,
        amounts,
        description: line.description ?? null,
      });
    }
    return built;
  }

  private async assertSupplier(
    tx: Prisma.TransactionClient,
    supplierId: string,
    companyId: string,
  ): Promise<void> {
    const supplier = await tx.partner.findFirst({
      where: { id: supplierId, companyId, deletedAt: null },
    });
    if (!supplier) {
      throw new NotFoundException({
        code: 'PARTNER_NOT_FOUND',
        message: `Supplier ${supplierId} was not found in this company.`,
        field: 'supplierId',
      });
    }
    if (!supplier.isSupplier) {
      throw new BadRequestException({
        code: 'PARTNER_NOT_SUPPLIER',
        message: `Partner "${supplier.name}" is not marked as a supplier.`,
        field: 'supplierId',
      });
    }
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

  private parseDate(value: string, field: string): Date {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException({
        code: 'INVALID_DATE',
        message: `"${value}" is not a valid date.`,
        field,
      });
    }
    return d;
  }
}
