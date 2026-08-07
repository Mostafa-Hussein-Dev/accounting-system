import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

const DEFAULT_RATE_TYPE = 'Official';

/**
 * Resolve the exchange rate ("currency units per 1 USD") for a sales document:
 * 1 when the document is in the company base currency; the caller-supplied rate
 * if given; otherwise the rate in force on `date` (newest ExchangeRate with
 * effectiveDate <= date for that currency + Official type). Throws if none.
 * Same contract as purchasing.rate.ts — kept local to avoid cross-module import.
 */
export async function resolveRate(
  tx: Prisma.TransactionClient,
  companyId: string,
  currencyCode: string,
  providedRate: number | undefined,
  date: Date,
): Promise<number> {
  const company = await tx.company.findUniqueOrThrow({
    where: { id: companyId },
    select: { baseCurrencyCode: true },
  });
  if (currencyCode === company.baseCurrencyCode) {
    return 1;
  }
  if (providedRate !== undefined && providedRate > 0) {
    return providedRate;
  }
  const inForce = await tx.exchangeRate.findFirst({
    where: {
      companyId,
      currencyCode,
      rateType: DEFAULT_RATE_TYPE,
      effectiveDate: { lte: date },
    },
    orderBy: { effectiveDate: 'desc' },
  });
  if (!inForce) {
    throw new BadRequestException({
      code: 'RATE_REQUIRED',
      message: `No ${DEFAULT_RATE_TYPE} exchange rate for ${currencyCode} on or before ${date.toISOString().slice(0, 10)}; supply a rate.`,
      field: 'rate',
    });
  }
  return Number(inForce.rate);
}
