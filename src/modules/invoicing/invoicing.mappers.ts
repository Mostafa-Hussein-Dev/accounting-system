import { Prisma } from '@prisma/client';
import {
  SalesInvoiceLineResponseDto,
  SalesInvoiceResponseDto,
} from './dto/sales-invoice.dto';
import {
  CreditNoteLineResponseDto,
  CreditNoteResponseDto,
} from './dto/credit-note.dto';

export const SI_INCLUDE = {
  lines: { orderBy: { lineNo: 'asc' } },
} satisfies Prisma.SalesInvoiceInclude;

type SalesInvoiceWithLines = Prisma.SalesInvoiceGetPayload<{
  include: typeof SI_INCLUDE;
}>;
type SalesInvoiceLineEntity = SalesInvoiceWithLines['lines'][number];

function toSiLine(l: SalesInvoiceLineEntity): SalesInvoiceLineResponseDto {
  return {
    id: l.id,
    lineNo: l.lineNo,
    itemId: l.itemId,
    variantId: l.variantId,
    uomId: l.uomId,
    qty: Number(l.qty),
    unitPrice: Number(l.unitPrice),
    lineDiscountPct: Number(l.lineDiscountPct),
    taxRateId: l.taxRateId,
    vatTreatment: l.vatTreatment,
    ratePct: Number(l.ratePct),
    netAmount: Number(l.netAmount),
    vatAmount: Number(l.vatAmount),
    totalAmount: Number(l.totalAmount),
    costBase: Number(l.costBase),
    stockMovementId: l.stockMovementId,
    description: l.description,
  };
}

export function toSalesInvoiceResponse(
  s: SalesInvoiceWithLines,
): SalesInvoiceResponseDto {
  return {
    id: s.id,
    companyId: s.companyId,
    invoiceNo: s.invoiceNo,
    status: s.status,
    customerId: s.customerId,
    branchId: s.branchId,
    locationId: s.locationId,
    currencyCode: s.currencyCode,
    rate: Number(s.rate),
    invoiceDate: s.invoiceDate,
    dueDate: s.dueDate,
    customerRef: s.customerRef,
    notes: s.notes,
    subtotal: Number(s.subtotal),
    vatTotal: Number(s.vatTotal),
    grandTotal: Number(s.grandTotal),
    subtotalBase: Number(s.subtotalBase),
    vatTotalBase: Number(s.vatTotalBase),
    grandTotalBase: Number(s.grandTotalBase),
    cogsTotalBase: Number(s.cogsTotalBase),
    journalEntryId: s.journalEntryId,
    postedAt: s.postedAt,
    lines: s.lines.map(toSiLine),
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

export const CN_INCLUDE = {
  lines: { orderBy: { lineNo: 'asc' } },
} satisfies Prisma.CreditNoteInclude;

type CreditNoteWithLines = Prisma.CreditNoteGetPayload<{
  include: typeof CN_INCLUDE;
}>;
type CreditNoteLineEntity = CreditNoteWithLines['lines'][number];

function toCnLine(l: CreditNoteLineEntity): CreditNoteLineResponseDto {
  return {
    id: l.id,
    lineNo: l.lineNo,
    itemId: l.itemId,
    variantId: l.variantId,
    uomId: l.uomId,
    qty: Number(l.qty),
    unitPrice: Number(l.unitPrice),
    lineDiscountPct: Number(l.lineDiscountPct),
    taxRateId: l.taxRateId,
    vatTreatment: l.vatTreatment,
    ratePct: Number(l.ratePct),
    netAmount: Number(l.netAmount),
    vatAmount: Number(l.vatAmount),
    totalAmount: Number(l.totalAmount),
    costBase: Number(l.costBase),
    stockMovementId: l.stockMovementId,
    description: l.description,
  };
}

export function toCreditNoteResponse(
  c: CreditNoteWithLines,
): CreditNoteResponseDto {
  return {
    id: c.id,
    companyId: c.companyId,
    creditNoteNo: c.creditNoteNo,
    status: c.status,
    customerId: c.customerId,
    salesInvoiceId: c.salesInvoiceId,
    branchId: c.branchId,
    locationId: c.locationId,
    currencyCode: c.currencyCode,
    rate: Number(c.rate),
    creditNoteDate: c.creditNoteDate,
    reason: c.reason,
    notes: c.notes,
    subtotal: Number(c.subtotal),
    vatTotal: Number(c.vatTotal),
    grandTotal: Number(c.grandTotal),
    subtotalBase: Number(c.subtotalBase),
    vatTotalBase: Number(c.vatTotalBase),
    grandTotalBase: Number(c.grandTotalBase),
    cogsTotalBase: Number(c.cogsTotalBase),
    journalEntryId: c.journalEntryId,
    postedAt: c.postedAt,
    lines: c.lines.map(toCnLine),
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}
