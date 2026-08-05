import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NormalBalance } from '@prisma/client';

/** The rate used to convert one source base currency into the presentation
 *  currency (Tier 2, docs/URGENT.md §6.5). */
export class PresentationRateDto {
  @ApiProperty({ description: 'Source base currency.', example: 'USD' })
  from!: string;
  @ApiProperty({
    description: 'Presentation units per 1 source.',
    example: 89500,
  })
  rate!: number;
  @ApiProperty({ example: 'Official' }) rateType!: string;
  @ApiProperty({ example: '2026-08-05' }) rateDate!: string;
}

/** A balance converted into a requested presentation currency (?presentIn).
 *  Storage never moves; this is display only. Figures are null when a required
 *  rate is missing — never a silent conversion. */
export class BalancePresentationDto {
  @ApiProperty({ example: 'LBP' }) currency!: string;
  @ApiPropertyOptional({ nullable: true }) totalDebitBase!: number | null;
  @ApiPropertyOptional({ nullable: true }) totalCreditBase!: number | null;
  @ApiPropertyOptional({ nullable: true }) balance!: number | null;
  @ApiPropertyOptional({ nullable: true }) naturalBalance!: number | null;
  @ApiProperty({ type: PresentationRateDto, isArray: true })
  rates!: PresentationRateDto[];
}

/** One base-currency slice of a balance (there is >1 only after a company's
 *  base currency changed while it had postings — see docs/URGENT.md). */
export class BaseCurrencyBalanceDto {
  @ApiProperty({ example: 'USD' }) currency!: string;
  @ApiProperty({ example: 1500 }) totalDebitBase!: number;
  @ApiProperty({ example: 500 }) totalCreditBase!: number;
  @ApiProperty({ example: 1000 }) balance!: number;
  @ApiProperty({ example: 1000 }) naturalBalance!: number;
}

/**
 * A single account’s balance, DERIVED from posted journal lines (invariant #4):
 * balance = Σ debit_base − Σ credit_base. `balance` is signed on the debit side;
 * `naturalBalance` re-signs it to the account’s normal side so a normally-credit
 * account (liability/revenue) reads positive when it carries a credit balance.
 *
 * `currency` is the base currency the figures are in, read from the STORED
 * baseCurrencyCode on the lines (never the mutable company setting). In the rare
 * case an account holds lines in more than one base currency, the scalar totals
 * are null and `byBaseCurrency` carries a figure per currency — the numbers are
 * never silently summed across currencies (docs/URGENT.md).
 */
export class AccountBalanceResponseDto {
  @ApiProperty({ example: 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab' })
  accountId!: string;

  @ApiProperty({ example: '531' })
  accountNumber!: string;

  @ApiProperty({ example: 'Cash' })
  accountName!: string;

  @ApiProperty({ enum: NormalBalance, example: NormalBalance.DEBIT })
  normalBalance!: NormalBalance;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Base currency of the figures (from the stored baseCurrencyCode). Null when the account holds more than one base currency — see byBaseCurrency.',
    example: 'USD',
  })
  currency!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Total debit base amount. Null when base currency is mixed.',
    example: 1500,
  })
  totalDebitBase!: number | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Total credit base amount. Null when base currency is mixed.',
    example: 500,
  })
  totalCreditBase!: number | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Debit-positive balance (debit − credit). Null when mixed.',
    example: 1000,
  })
  balance!: number | null;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Balance signed to the account’s normal side. Null when mixed.',
    example: 1000,
  })
  naturalBalance!: number | null;

  @ApiProperty({
    type: BaseCurrencyBalanceDto,
    isArray: true,
    description:
      'Per-base-currency figures. One entry in the normal case; several only for a mixed-base account.',
  })
  byBaseCurrency!: BaseCurrencyBalanceDto[];

  @ApiPropertyOptional({
    type: BalancePresentationDto,
    nullable: true,
    description:
      'Present the balance in a requested currency (?presentIn). Null unless requested; its figures are null when a required rate is missing.',
  })
  presentation?: BalancePresentationDto | null;

  @ApiProperty({
    description: 'Balances include entries up to and including this date.',
    example: '2026-07-23',
  })
  asOf!: string;
}
