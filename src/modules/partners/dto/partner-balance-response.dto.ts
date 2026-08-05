import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** The rate used to convert one source base currency into the presentation
 *  currency (Tier 2, docs/URGENT.md §6.5). */
export class PartnerPresentationRateDto {
  @ApiProperty({ example: 'USD' }) from!: string;
  @ApiProperty({ example: 89500 }) rate!: number;
  @ApiProperty({ example: 'Official' }) rateType!: string;
  @ApiProperty({ example: '2026-08-05' }) rateDate!: string;
}

/** The partner balance converted into a requested presentation currency
 *  (?presentIn). Display only; null figures when a rate is missing. */
export class PartnerBalancePresentationDto {
  @ApiProperty({ example: 'LBP' }) currency!: string;
  @ApiPropertyOptional({ nullable: true }) totalDebitBase!: number | null;
  @ApiPropertyOptional({ nullable: true }) totalCreditBase!: number | null;
  @ApiPropertyOptional({ nullable: true }) balanceBase!: number | null;
  @ApiProperty({ type: PartnerPresentationRateDto, isArray: true })
  rates!: PartnerPresentationRateDto[];
}

/** One base-currency slice of a partner balance (>1 only after the company's
 *  base currency changed while it had postings — docs/URGENT.md). */
export class PartnerBaseCurrencyBalanceDto {
  @ApiProperty({ example: 'USD' }) currency!: string;
  @ApiProperty({ example: 1500 }) totalDebitBase!: number;
  @ApiProperty({ example: 500 }) totalCreditBase!: number;
  @ApiProperty({ example: 1000 }) balanceBase!: number;
}

export class PartnerCurrencyBalanceDto {
  @ApiProperty({ example: 'USD' }) currency!: string;
  @ApiProperty({
    description: 'Σ debit in the original currency.',
    example: 1500,
  })
  debit!: number;
  @ApiProperty({
    description: 'Σ credit in the original currency.',
    example: 500,
  })
  credit!: number;
  @ApiProperty({
    description: 'debit − credit in the original currency.',
    example: 1000,
  })
  net!: number;
}

/**
 * A partner's balance, DERIVED from posted journal lines carrying its partnerId
 * (subsidiary ledger). `balanceBase` is in the company base currency (USD),
 * signed debit − credit (positive = the partner owes us / receivable). The
 * per-currency breakdown lets a caller show the balance in USD and LBP (FR-301
 * AC2) straight from the postings, without needing a conversion rate.
 */
export class PartnerBalanceResponseDto {
  @ApiProperty({ example: 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab' })
  partnerId!: string;
  @ApiProperty({ example: '410001' }) ref!: string;
  @ApiProperty({ example: 'ACME Trading SARL' }) name!: string;
  @ApiProperty({
    description: 'YYYY-MM-DD the balance is computed up to.',
    example: '2026-12-31',
  })
  asOf!: string;
  @ApiPropertyOptional({
    nullable: true,
    description:
      'Base currency of the *Base figures, from the stored baseCurrencyCode. Null when the partner holds more than one base currency — see byBaseCurrency.',
    example: 'USD',
  })
  baseCurrency!: string | null;
  @ApiPropertyOptional({
    nullable: true,
    description: 'Σ debit in base currency. Null when base currency is mixed.',
    example: 1500,
  })
  totalDebitBase!: number | null;
  @ApiPropertyOptional({
    nullable: true,
    description: 'Σ credit in base currency. Null when base currency is mixed.',
    example: 500,
  })
  totalCreditBase!: number | null;
  @ApiPropertyOptional({
    nullable: true,
    description: 'debit − credit in base currency. Null when mixed.',
    example: 1000,
  })
  balanceBase!: number | null;

  @ApiProperty({
    type: PartnerBaseCurrencyBalanceDto,
    isArray: true,
    description:
      'Per-base-currency figures (one entry normally; several only for a mixed-base partner).',
  })
  byBaseCurrency!: PartnerBaseCurrencyBalanceDto[];

  @ApiProperty({
    type: PartnerCurrencyBalanceDto,
    isArray: true,
    description:
      'Per-ORIGINAL-currency breakdown (from amountOriginal/currency; already self-describing).',
  })
  byCurrency!: PartnerCurrencyBalanceDto[];

  @ApiPropertyOptional({
    type: PartnerBalancePresentationDto,
    nullable: true,
    description:
      'Balance in a requested currency (?presentIn). Null unless requested; figures null when a rate is missing.',
  })
  presentation?: PartnerBalancePresentationDto | null;
}
