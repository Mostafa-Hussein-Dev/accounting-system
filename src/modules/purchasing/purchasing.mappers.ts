import { Prisma } from '@prisma/client';
import {
  PurchaseOrderLineResponseDto,
  PurchaseOrderResponseDto,
} from './dto/purchase-order.dto';

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
