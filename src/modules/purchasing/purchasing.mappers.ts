import { Prisma } from '@prisma/client';
import {
  PurchaseOrderLineResponseDto,
  PurchaseOrderResponseDto,
} from './dto/purchase-order.dto';
import {
  GoodsReceiptLineResponseDto,
  GoodsReceiptResponseDto,
} from './dto/goods-receipt.dto';

export const PO_INCLUDE = {
  lines: { orderBy: { lineNo: 'asc' } },
} satisfies Prisma.PurchaseOrderInclude;

type PurchaseOrderWithLines = Prisma.PurchaseOrderGetPayload<{
  include: typeof PO_INCLUDE;
}>;
type PurchaseOrderLineEntity = PurchaseOrderWithLines['lines'][number];

function toLine(l: PurchaseOrderLineEntity): PurchaseOrderLineResponseDto {
  return {
    id: l.id,
    lineNo: l.lineNo,
    itemId: l.itemId,
    variantId: l.variantId,
    uomId: l.uomId,
    qtyOrdered: Number(l.qtyOrdered),
    qtyReceived: Number(l.qtyReceived),
    unitCost: Number(l.unitCost),
    taxRateId: l.taxRateId,
    vatTreatment: l.vatTreatment,
    ratePct: Number(l.ratePct),
    netAmount: Number(l.netAmount),
    vatAmount: Number(l.vatAmount),
    totalAmount: Number(l.totalAmount),
    description: l.description,
  };
}

export const GR_INCLUDE = {
  lines: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.GoodsReceiptInclude;

type GoodsReceiptWithLines = Prisma.GoodsReceiptGetPayload<{
  include: typeof GR_INCLUDE;
}>;
type GoodsReceiptLineEntity = GoodsReceiptWithLines['lines'][number];

function toGrLine(l: GoodsReceiptLineEntity): GoodsReceiptLineResponseDto {
  return {
    id: l.id,
    purchaseOrderLineId: l.purchaseOrderLineId,
    itemId: l.itemId,
    variantId: l.variantId,
    uomId: l.uomId,
    qtyReceived: Number(l.qtyReceived),
    unitCostBase: Number(l.unitCostBase),
    stockMovementId: l.stockMovementId,
  };
}

export function toGoodsReceiptResponse(
  gr: GoodsReceiptWithLines,
): GoodsReceiptResponseDto {
  return {
    id: gr.id,
    companyId: gr.companyId,
    receiptNo: gr.receiptNo,
    status: gr.status,
    purchaseOrderId: gr.purchaseOrderId,
    locationId: gr.locationId,
    branchId: gr.branchId,
    receiptDate: gr.receiptDate,
    notes: gr.notes,
    lines: gr.lines.map(toGrLine),
    createdAt: gr.createdAt,
  };
}

export function toPurchaseOrderResponse(
  po: PurchaseOrderWithLines,
): PurchaseOrderResponseDto {
  return {
    id: po.id,
    companyId: po.companyId,
    orderNo: po.orderNo,
    status: po.status,
    supplierId: po.supplierId,
    branchId: po.branchId,
    currencyCode: po.currencyCode,
    rate: Number(po.rate),
    orderDate: po.orderDate,
    expectedDate: po.expectedDate,
    notes: po.notes,
    subtotal: Number(po.subtotal),
    vatTotal: Number(po.vatTotal),
    grandTotal: Number(po.grandTotal),
    subtotalBase: Number(po.subtotalBase),
    vatTotalBase: Number(po.vatTotalBase),
    grandTotalBase: Number(po.grandTotalBase),
    lines: po.lines.map(toLine),
    createdAt: po.createdAt,
    updatedAt: po.updatedAt,
  };
}
