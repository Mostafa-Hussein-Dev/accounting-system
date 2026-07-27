import { ApiProperty } from '@nestjs/swagger';

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
  @ApiProperty({ description: 'Σ debit in base currency.', example: 1500 })
  totalDebitBase!: number;
  @ApiProperty({ description: 'Σ credit in base currency.', example: 500 })
  totalCreditBase!: number;
  @ApiProperty({
    description: 'debit − credit in base currency (USD).',
    example: 1000,
  })
  balanceBase!: number;

  @ApiProperty({ type: PartnerCurrencyBalanceDto, isArray: true })
  byCurrency!: PartnerCurrencyBalanceDto[];
}
