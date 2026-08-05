import { Prisma } from '@prisma/client';

export const DEFAULT_RATE_TYPE = 'Official';

export interface PresentationRate {
  from: string;
  to: string;
  /** `to` units per 1 `from`. */
  rate: number;
  rateType: string;
  /** effectiveDate of the rate used (YYYY-MM-DD). */
  rateDate: string;
}

type ExchangeRateReader = Pick<Prisma.TransactionClient, 'exchangeRate'>;

/**
 * Resolve the rate to convert `from` -> `to` as of `onDate`, via the USD pivot
 * (ExchangeRate.rate is "<currency> per 1 USD", never inverted). Two hops for a
 * non-USD -> non-USD pair. Returns null when any leg has no rate on/before the
 * date — a missing rate is never a silent fallback of 1 (docs/URGENT.md §6.5).
 */
export async function resolvePresentationRate(
  prisma: ExchangeRateReader,
  companyId: string,
  from: string,
  to: string,
  onDate: Date,
  rateType: string = DEFAULT_RATE_TYPE,
): Promise<PresentationRate | null> {
  const iso = (d: Date): string => d.toISOString().slice(0, 10);
  if (from === to) {
    return { from, to, rate: 1, rateType, rateDate: iso(onDate) };
  }
  const perUsd = async (
    cur: string,
  ): Promise<{ rate: number; date: Date } | null> => {
    if (cur === 'USD') return { rate: 1, date: onDate };
    const row = await prisma.exchangeRate.findFirst({
      where: {
        companyId,
        currencyCode: cur,
        rateType,
        effectiveDate: { lte: onDate },
      },
      orderBy: { effectiveDate: 'desc' },
      select: { rate: true, effectiveDate: true },
    });
    return row ? { rate: Number(row.rate), date: row.effectiveDate } : null;
  };
  const f = await perUsd(from);
  const t = await perUsd(to);
  if (!f || !t) return null;
  // (to per USD) / (from per USD) = to per from.
  const rate = t.rate / f.rate;
  const date = f.date > t.date ? f.date : t.date;
  return { from, to, rate, rateType, rateDate: iso(date) };
}
