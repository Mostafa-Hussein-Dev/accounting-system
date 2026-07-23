import { BadRequestException } from '@nestjs/common';

/**
 * The Money value object (docs/MODELS.md). Every monetary value in the system
 * carries all four fields together — never a bare number. Base amounts are
 * always SERVER-COMPUTED (invariant #3) and, once posted, frozen (invariant #6).
 */
export interface Money {
  /** Amount in the original transaction currency. */
  amountOriginal: number;
  /** ISO 4217 code of the original currency, e.g. 'USD' or 'LBP'. */
  currency: string;
  /** Exchange rate as "currency units per 1 USD" (the project-wide convention). */
  rate: number;
  /** Equivalent in the company base currency. */
  amountBase: number;
}

/** USD is the system's anchor currency — cross-currency conversion pivots on it. */
const ANCHOR_CURRENCY = 'USD';

/**
 * Round half-up to `decimals` places. Kept deliberately small; amounts are
 * persisted as SQL DECIMAL, this only tidies the computed base before storage.
 */
export function roundMoney(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  // + a tiny epsilon so values like 1.005 round up despite float representation.
  return (
    Math.round((value + Number.EPSILON * Math.sign(value)) * factor) / factor
  );
}

/**
 * Convert an original amount into the company base currency using the line's
 * rate (currency units per 1 USD). The system anchors on USD, so exactly one of
 * the two currencies must be USD when they differ — that covers USD↔LBP in both
 * directions and any USD-anchored base. A same-currency conversion is the
 * identity (rate is irrelevant and must be 1).
 */
export function convertToBase(
  amountOriginal: number,
  currency: string,
  rate: number,
  baseCurrency: string,
  decimals = 2,
): number {
  if (currency === baseCurrency) {
    return roundMoney(amountOriginal, decimals);
  }
  if (rate <= 0) {
    throw new BadRequestException({
      code: 'JOURNAL_RATE_REQUIRED',
      message: `A positive exchange rate is required to convert ${currency} to ${baseCurrency}.`,
      field: 'rate',
    });
  }
  if (baseCurrency === ANCHOR_CURRENCY) {
    // rate = original-currency units per 1 USD  ->  USD = original / rate
    return roundMoney(amountOriginal / rate, decimals);
  }
  if (currency === ANCHOR_CURRENCY) {
    // converting a USD amount into a non-USD base; rate = base units per 1 USD
    return roundMoney(amountOriginal * rate, decimals);
  }
  throw new BadRequestException({
    code: 'CURRENCY_CONVERSION_UNSUPPORTED',
    message: `Cannot convert ${currency} to ${baseCurrency}: one side must be ${ANCHOR_CURRENCY}.`,
    field: 'currency',
  });
}

/**
 * Build a Money from an original amount + rate, computing the base server-side.
 * When the original currency IS the base currency, the rate is normalized to 1.
 */
export function buildMoney(
  amountOriginal: number,
  currency: string,
  rate: number,
  baseCurrency: string,
  decimals = 2,
): Money {
  const normalizedRate = currency === baseCurrency ? 1 : rate;
  return {
    amountOriginal,
    currency,
    rate: normalizedRate,
    amountBase: convertToBase(
      amountOriginal,
      currency,
      normalizedRate,
      baseCurrency,
      decimals,
    ),
  };
}
