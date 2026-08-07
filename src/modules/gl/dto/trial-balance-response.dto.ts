import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PresentationRateDto } from './account-balance-response.dto';

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
 * One self-contained trial balance in a single base currency. Used to present a
 * mixed-base company (post a base-currency change): a trial balance can only
 * balance WITHIN one currency, so a mixed scope returns one of these per stored
 * base currency rather than summing across them (docs/URGENT.md §6.3).
 */
export class TrialBalanceCurrencyGroupDto {
  @ApiProperty({ example: 'USD' })
  currency!: string;

  @ApiProperty({ type: TrialBalanceRowDto, isArray: true })
  rows!: TrialBalanceRowDto[];

  @ApiProperty({ example: 1000 })
  totalDebit!: number;

  @ApiProperty({ example: 1000 })
  totalCredit!: number;

  @ApiProperty({ example: true })
  isBalanced!: boolean;
}

/** Echoes the ?presentIn conversion: the target currency, the rates used, and
 *  whether every source currency could be converted. */
export class TrialBalancePresentationDto {
  @ApiProperty({ example: 'USD' })
  currency!: string;

  @ApiProperty({
    description:
      'True when every base currency in scope had a rate and the rows/totals below are fully converted; false when a rate was missing (rows fall back to the per-currency breakdown).',
    example: true,
  })
  converted!: boolean;

  @ApiProperty({ type: PresentationRateDto, isArray: true })
  rates!: PresentationRateDto[];
}

/**
 * The trial balance (FR-905): every account with posted activity, its net
 * balance placed in the debit or credit column. Within a single base currency
 * `totalDebit` must equal `totalCredit` — the whole point of the report.
 *
 * Currency handling (mirrors the account-balance endpoint):
 * - Uniform base currency → `currency` set, `rows`/`totalDebit`/`totalCredit`
 *   populated as usual.
 * - `?presentIn=XXX` → everything converted into that currency (flat rows +
 *   totals), with `presentation` describing the rates; if any rate is missing it
 *   falls back to the breakdown below and `presentation.converted` is false.
 * - Mixed base currency with no (usable) presentIn → `currency` is null, the flat
 *   `rows` are empty and `totalDebit`/`totalCredit` are null (never summed across
 *   currencies); `byBaseCurrency` carries one balanced trial balance per currency.
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
      'Base currency of the flat rows/totals. Null when the scope spans more than one base currency and no ?presentIn was applied (read byBaseCurrency instead).',
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

  @ApiProperty({
    nullable: true,
    description: 'Null when mixed base currency and no ?presentIn was applied.',
    example: 1000,
  })
  totalDebit!: number | null;

  @ApiProperty({ nullable: true, example: 1000 })
  totalCredit!: number | null;

  @ApiProperty({
    description:
      'Whether the trial balance balances. For a mixed scope, true only when every per-currency group balances.',
    example: true,
  })
  isBalanced!: boolean;

  @ApiPropertyOptional({
    type: TrialBalanceCurrencyGroupDto,
    isArray: true,
    nullable: true,
    description:
      'One balanced trial balance per base currency; present only for a mixed scope viewed without a usable ?presentIn.',
  })
  byBaseCurrency?: TrialBalanceCurrencyGroupDto[] | null;

  @ApiPropertyOptional({
    type: TrialBalancePresentationDto,
    nullable: true,
    description: 'Present only when ?presentIn was requested.',
  })
  presentation?: TrialBalancePresentationDto | null;
}
