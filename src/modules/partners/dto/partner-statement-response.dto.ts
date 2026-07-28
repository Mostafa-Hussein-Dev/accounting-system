import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StatementConversionDto {
  @ApiProperty({ example: 'LBP' }) currency!: string;
  @ApiProperty({ example: 'Official' }) rateType!: string;
  @ApiProperty({ description: 'LBP per 1 USD.', example: 89500 }) rate!: number;
  @ApiProperty({
    description: 'effectiveDate of the rate used (YYYY-MM-DD).',
    example: '2026-12-31',
  })
  rateDate!: string;
}

export class StatementRowDto {
  @ApiProperty({ example: '2026-03-14' }) date!: string;
  @ApiPropertyOptional({ nullable: true, example: 'JE-2026-0007' })
  entryNumber!: string | null;
  @ApiProperty({ example: 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab' })
  journalEntryId!: string;
  @ApiPropertyOptional({ nullable: true }) reference!: string | null;
  @ApiPropertyOptional({ nullable: true }) description!: string | null;

  // Raw debit/credit columns (base = USD).
  @ApiProperty({ example: 250 }) debitBase!: number;
  @ApiProperty({ example: 0 }) creditBase!: number;
  // Role-oriented signed running balance in base (USD): + = customer owes us / we owe supplier.
  @ApiProperty({ example: 250 }) runningBalanceBase!: number;

  // The line's own amount in its original currency.
  @ApiProperty({ example: 250 }) amountOriginal!: number;
  @ApiProperty({ example: 'USD' }) currency!: string;

  // Same columns converted to the display currency (LBP); null when no rate is on file.
  @ApiPropertyOptional({ nullable: true, example: 22375000 }) debitDisplay!:
    number | null;
  @ApiPropertyOptional({ nullable: true, example: 0 }) creditDisplay!:
    number | null;
  @ApiPropertyOptional({ nullable: true, example: 22375000 })
  runningBalanceDisplay!: number | null;
}

/**
 * A partner statement (relevé, FR-303): the partner's ledger over [from, to]
 * with an opening balance, each posted transaction and a role-oriented running
 * balance, and a closing balance — in base currency (USD) and converted to a
 * display currency (LBP, at the rate in force on `to`). Derived from posted
 * journal lines carrying the partnerId; nothing is stored.
 */
export class PartnerStatementResponseDto {
  @ApiProperty({ example: 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab' })
  partnerId!: string;
  @ApiProperty({ example: '410001' }) ref!: string;
  @ApiProperty({ example: 'ACME Trading SARL' }) name!: string;

  @ApiProperty({ example: '2026-01-01' }) from!: string;
  @ApiProperty({ example: '2026-12-31' }) to!: string;

  @ApiProperty({ example: 'USD' }) baseCurrency!: string;
  @ApiProperty({ example: 'LBP' }) displayCurrency!: string;

  @ApiProperty({
    description: 'Orientation of the running balance sign.',
    enum: ['receivable', 'payable'],
    example: 'receivable',
  })
  orientation!: 'receivable' | 'payable';

  @ApiPropertyOptional({
    type: StatementConversionDto,
    nullable: true,
    description:
      'The LBP conversion rate used; null when no rate is in force on `to` (display columns are then null).',
  })
  conversion!: StatementConversionDto | null;

  @ApiProperty({ example: 1000 }) openingBalanceBase!: number;
  @ApiPropertyOptional({ nullable: true, example: 89500000 })
  openingBalanceDisplay!: number | null;

  @ApiProperty({ type: StatementRowDto, isArray: true })
  rows!: StatementRowDto[];

  @ApiProperty({ example: 1750 }) totalDebitBase!: number;
  @ApiProperty({ example: 800 }) totalCreditBase!: number;
  @ApiPropertyOptional({ nullable: true }) totalDebitDisplay!: number | null;
  @ApiPropertyOptional({ nullable: true }) totalCreditDisplay!: number | null;

  @ApiProperty({ example: 1950 }) closingBalanceBase!: number;
  @ApiPropertyOptional({ nullable: true, example: 174525000 })
  closingBalanceDisplay!: number | null;
}
