import { ApiProperty } from '@nestjs/swagger';

export class TrialBalanceRowDto {
  @ApiProperty({
    description: 'Account id — empty on a rolled-up (group) row.',
    example: 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab',
  })
  accountId!: string;

  @ApiProperty({
    description:
      'Account number, or the group key (prefix/class) when rolled up.',
    example: '531',
  })
  accountNumber!: string;

  @ApiProperty({ example: 'Cash' })
  accountName!: string;

  @ApiProperty({
    description:
      'Net debit balance for the account (0 if it nets to a credit).',
    example: 1000,
  })
  debit!: number;

  @ApiProperty({
    description:
      'Net credit balance for the account (0 if it nets to a debit).',
    example: 0,
  })
  credit!: number;
}

/**
 * The trial balance (FR-905): every account with posted activity, its net
 * balance placed in the debit or credit column. `totalDebit` must equal
 * `totalCredit` — the whole point of the report (invariant #1).
 */
export class TrialBalanceResponseDto {
  @ApiProperty({ example: '586b91ef-6b89-4e9b-bcaa-99976d65fc4a' })
  companyId!: string;

  @ApiProperty({
    description: 'Balances include entries up to and including this date.',
    example: '2026-07-23',
  })
  asOf!: string;

  @ApiProperty({
    nullable: true,
    description:
      'Base currency of the amounts, from the stored baseCurrencyCode. Null when the scope spans more than one base currency (use ?presentIn to convert).',
    example: 'USD',
  })
  currency!: string | null;

  @ApiProperty({
    description:
      'Whether rows are rolled-up group summaries rather than accounts.',
    example: false,
  })
  rolledUp!: boolean;

  @ApiProperty({ type: TrialBalanceRowDto, isArray: true })
  rows!: TrialBalanceRowDto[];

  @ApiProperty({ example: 1000 })
  totalDebit!: number;

  @ApiProperty({ example: 1000 })
  totalCredit!: number;

  @ApiProperty({
    description: 'Whether the trial balance balances (totals are equal).',
    example: true,
  })
  isBalanced!: boolean;
}
