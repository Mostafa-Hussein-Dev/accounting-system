import { ApiProperty } from '@nestjs/swagger';
import { NormalBalance } from '@prisma/client';

/**
 * A single account’s balance, DERIVED from posted journal lines (invariant #4):
 * balance = Σ debit_base − Σ credit_base. `balance` is signed on the debit side;
 * `naturalBalance` re-signs it to the account’s normal side so a normally-credit
 * account (liability/revenue) reads positive when it carries a credit balance.
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

  @ApiProperty({ description: 'Total debit base amount', example: 1500 })
  totalDebitBase!: number;

  @ApiProperty({ description: 'Total credit base amount', example: 500 })
  totalCreditBase!: number;

  @ApiProperty({
    description: 'Debit-positive balance (debit − credit).',
    example: 1000,
  })
  balance!: number;

  @ApiProperty({
    description: 'Balance signed to the account’s normal side.',
    example: 1000,
  })
  naturalBalance!: number;

  @ApiProperty({
    description: 'Balances include entries up to and including this date.',
    example: '2026-07-23',
  })
  asOf!: string;
}
