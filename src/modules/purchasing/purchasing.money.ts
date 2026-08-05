import { Prisma, TaxTreatment } from '@prisma/client';

// Shared money maths for purchasing documents. Amounts are kept in the document
// currency and in base (USD); rate is "currency units per 1 USD", so
// base = original / rate (project-wide convention).

const round2 = (n: number): number =>
  Math.round((n + Number.EPSILON) * 100) / 100;

export interface LineInput {
  qty: number;
  unitCost: number;
  vatTreatment: TaxTreatment;
  ratePct: number;
}

export interface LineAmounts {
  netAmount: number;
  vatAmount: number;
  totalAmount: number;
}

/** Net / VAT / total for one document line, in the document currency. */
export function computeLine(line: LineInput): LineAmounts {
  const net = round2(line.qty * line.unitCost);
  const vat =
    line.vatTreatment === TaxTreatment.STANDARD
      ? round2((net * line.ratePct) / 100)
      : 0;
  return { netAmount: net, vatAmount: vat, totalAmount: round2(net + vat) };
}

export interface DocTotals {
  subtotal: number;
  vatTotal: number;
  grandTotal: number;
  subtotalBase: number;
  vatTotalBase: number;
  grandTotalBase: number;
}

/** Sum line amounts into document totals (doc currency + base via rate). */
export function computeTotals(lines: LineAmounts[], rate: number): DocTotals {
  const subtotal = round2(lines.reduce((s, l) => s + l.netAmount, 0));
  const vatTotal = round2(lines.reduce((s, l) => s + l.vatAmount, 0));
  const grandTotal = round2(subtotal + vatTotal);
  const toBase = (n: number): number => round2(n / rate);
  return {
    subtotal,
    vatTotal,
    grandTotal,
    subtotalBase: toBase(subtotal),
    vatTotalBase: toBase(vatTotal),
    grandTotalBase: toBase(grandTotal),
  };
}

/** Convert a document-currency amount to base (USD). */
export function toBase(amount: number, rate: number): number {
  return round2(amount / rate);
}

export const toDecimal = (n: number): Prisma.Decimal => new Prisma.Decimal(n);
