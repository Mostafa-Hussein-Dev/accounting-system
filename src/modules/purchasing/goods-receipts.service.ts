import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DocumentType,
  GoodsReceiptStatus,
  LocationType,
  Prisma,
  PurchaseOrderStatus,
  StockMovementType,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { Paginated } from '../../common/types/paginated.type';
import { SequencesService } from '../sequences/sequences.service';
import { StockService } from '../stock/stock.service';
import {
  isPlatformAdmin,
  type AuthenticatedUser,
} from '../auth/interfaces/authenticated-user.interface';
import {
  CreateGoodsReceiptDto,
  GoodsReceiptResponseDto,
  QueryGoodsReceiptDto,
} from './dto/goods-receipt.dto';
import { toGoodsReceiptResponse, GR_INCLUDE } from './purchasing.mappers';

const round = (n: number, dp: number): number => {
  const f = 10 ** dp;
  return Math.round((n + Number.EPSILON) * f) / f;
};

@Injectable()
export class GoodsReceiptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequences: SequencesService,
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
   * Receive goods against a confirmed PO (full or partial): posts inbound stock
   * movements (supplier -> destination location) at frozen base cost, links each
   * line to its movement, advances PO line qtyReceived and the PO status —
   * all atomically. No GL entry here (that's the vendor bill).
   */
  async receive(
    dto: CreateGoodsReceiptDto,
    caller: AuthenticatedUser,
  ): Promise<GoodsReceiptResponseDto> {
    const companyId = this.resolveCompanyId(dto.companyId, caller);
    const receiptDate = this.parseDate(dto.receiptDate);
    const dateStr = receiptDate.toISOString().slice(0, 10);

    const receipt = await this.prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.findFirst({
        where: { id: dto.purchaseOrderId, companyId, deletedAt: null },
        include: { lines: true },
      });
      if (!po) {
        throw new NotFoundException({
          code: 'PURCHASE_ORDER_NOT_FOUND',
          message: `Purchase order ${dto.purchaseOrderId} was not found.`,
          field: 'purchaseOrderId',
        });
      }
      if (
        po.status !== PurchaseOrderStatus.CONFIRMED &&
        po.status !== PurchaseOrderStatus.PARTIALLY_RECEIVED
      ) {
        throw new ConflictException({
          code: 'PO_NOT_RECEIVABLE',
          message: `A ${po.status} purchase order cannot receive goods (confirm it first).`,
          field: null,
        });
      }

      const location = await tx.location.findFirst({
        where: { id: dto.locationId, companyId, deletedAt: null },
      });
      if (!location || location.type !== LocationType.INTERNAL) {
        throw new BadRequestException({
          code: 'LOCATION_INVALID',
          message:
            'The destination must be an internal location in this company.',
          field: 'locationId',
        });
      }
      const supplierLoc = await tx.location.findFirst({
        where: { companyId, type: LocationType.SUPPLIER, deletedAt: null },
      });
      if (!supplierLoc) {
        throw new NotFoundException({
          code: 'VIRTUAL_LOCATION_MISSING',
          message: 'No SUPPLIER location is configured for this company.',
          field: null,
        });
      }

      const receiptNo = await this.sequences.nextNumber(
        companyId,
        dto.branchId ?? null,
        DocumentType.GOODS_RECEIPT,
        receiptDate,
        tx,
      );
      const header = await tx.goodsReceipt.create({
        data: {
          companyId,
          receiptNo,
          status: GoodsReceiptStatus.CONFIRMED,
          purchaseOrderId: po.id,
          locationId: location.id,
          branchId: dto.branchId ?? null,
          receiptDate,
          notes: dto.notes ?? null,
          createdBy: caller.userId,
        },
      });

      const baseUomFactors = new Map<string, number>();
      const factorOf = async (uomId: string): Promise<number> => {
        const cached = baseUomFactors.get(uomId);
        if (cached !== undefined) return cached;
        const uom = await tx.uom.findUniqueOrThrow({
          where: { id: uomId },
          select: { factor: true },
        });
        const f = Number(uom.factor);
        baseUomFactors.set(uomId, f);
        return f;
      };

      for (const rl of dto.lines) {
        const poLine = po.lines.find((l) => l.id === rl.purchaseOrderLineId);
        if (!poLine) {
          throw new BadRequestException({
            code: 'PO_LINE_NOT_FOUND',
            message: `Line ${rl.purchaseOrderLineId} does not belong to this purchase order.`,
            field: 'purchaseOrderLineId',
          });
        }
        const remaining = round(
          Number(poLine.qtyOrdered) - Number(poLine.qtyReceived),
          3,
        );
        if (rl.qtyReceived > remaining + 1e-9) {
          throw new ConflictException({
            code: 'OVER_RECEIPT',
            message: `Cannot receive ${rl.qtyReceived}; only ${remaining} remaining on that line.`,
            field: 'qtyReceived',
          });
        }

        const item = await tx.item.findUniqueOrThrow({
          where: { id: poLine.itemId },
          select: { baseUomId: true },
        });
        const lineFactor = await factorOf(poLine.uomId);
        const baseFactor = await factorOf(item.baseUomId);
        const qtyBase = round((rl.qtyReceived * lineFactor) / baseFactor, 3);
        const valueBase = round(
          (rl.qtyReceived * Number(poLine.unitCost)) / Number(po.rate),
          4,
        );
        const unitCostBase = qtyBase > 0 ? round(valueBase / qtyBase, 4) : 0;

        const movement = await this.stock.postMovementInTx(
          tx,
          {
            type: StockMovementType.RECEIPT,
            movementDate: dateStr,
            itemId: poLine.itemId,
            variantId: poLine.variantId ?? undefined,
            fromLocationId: supplierLoc.id,
            toLocationId: location.id,
            qty: qtyBase,
            unitCost: unitCostBase,
            partnerId: po.supplierId,
            branchId: dto.branchId ?? undefined,
            reference: receiptNo,
            sourceDocType: DocumentType.GOODS_RECEIPT,
            sourceDocId: header.id,
            companyId,
          },
          caller,
        );

        await tx.goodsReceiptLine.create({
          data: {
            companyId,
            goodsReceiptId: header.id,
            purchaseOrderLineId: poLine.id,
            itemId: poLine.itemId,
            variantId: poLine.variantId,
            uomId: poLine.uomId,
            qtyReceived: new Prisma.Decimal(rl.qtyReceived),
            unitCostBase: new Prisma.Decimal(unitCostBase),
            stockMovementId: movement.id,
          },
        });
        await tx.purchaseOrderLine.update({
          where: { id: poLine.id },
          data: {
            qtyReceived: new Prisma.Decimal(
              round(Number(poLine.qtyReceived) + rl.qtyReceived, 3),
            ),
          },
        });
      }

      // Advance PO status from the freshest line totals.
      const refreshed = await tx.purchaseOrderLine.findMany({
        where: { purchaseOrderId: po.id },
        select: { qtyOrdered: true, qtyReceived: true },
      });
      const fullyReceived = refreshed.every(
        (l) => Number(l.qtyReceived) >= Number(l.qtyOrdered) - 1e-9,
      );
      await tx.purchaseOrder.update({
        where: { id: po.id },
        data: {
          status: fullyReceived
            ? PurchaseOrderStatus.RECEIVED
            : PurchaseOrderStatus.PARTIALLY_RECEIVED,
        },
      });

      return tx.goodsReceipt.findUniqueOrThrow({
        where: { id: header.id },
        include: GR_INCLUDE,
      });
    });
    return toGoodsReceiptResponse(receipt);
  }

  async findAll(
    query: QueryGoodsReceiptDto,
    caller: AuthenticatedUser,
  ): Promise<Paginated<GoodsReceiptResponseDto>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.GoodsReceiptWhereInput = {};
    if (query.companyId) where.companyId = query.companyId;
    if (query.purchaseOrderId) where.purchaseOrderId = query.purchaseOrderId;
    const client = this.clientFor(caller);
    const [rows, total] = await this.prisma.$transaction([
      client.goodsReceipt.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: GR_INCLUDE,
      }),
      client.goodsReceipt.count({ where }),
    ]);
    return Paginated.of(rows.map(toGoodsReceiptResponse), total, page, limit);
  }

  async findOne(
    id: string,
    caller: AuthenticatedUser,
  ): Promise<GoodsReceiptResponseDto> {
    const gr = await this.clientFor(caller).goodsReceipt.findFirst({
      where: { id },
      include: GR_INCLUDE,
    });
    if (!gr) {
      throw new NotFoundException({
        code: 'GOODS_RECEIPT_NOT_FOUND',
        message: `Goods receipt ${id} was not found.`,
        field: null,
      });
    }
    return toGoodsReceiptResponse(gr);
  }

  private parseDate(value: string): Date {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException({
        code: 'INVALID_DATE',
        message: `"${value}" is not a valid date.`,
        field: 'receiptDate',
      });
    }
    return d;
  }
}
