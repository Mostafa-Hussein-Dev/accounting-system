import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { JournalSide } from '@prisma/client';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

/**
 * One input line of a manual journal entry. A line is a debit OR a credit
 * (`side`) against one account. `amountBase` is never accepted from the client —
 * the server computes it from amountOriginal + rate (invariant #3).
 */
export class JournalLineDto {
  @ApiProperty({
    description: 'Account to post to (must belong to the entry’s company).',
    example: 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab',
  })
  @IsString()
  accountId!: string;

  @ApiProperty({ enum: JournalSide, example: JournalSide.DEBIT })
  @IsEnum(JournalSide)
  side!: JournalSide;

  @ApiProperty({
    description: 'Amount in the original currency (> 0).',
    example: 100,
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amountOriginal!: number;

  @ApiProperty({
    description: 'ISO 4217 currency code of the amount.',
    example: 'USD',
  })
  @IsString()
  @Length(3, 3)
  currency!: string;

  @ApiPropertyOptional({
    description:
      'Exchange rate (currency units per 1 USD). Optional: defaults to the rate in force on the entry date, or 1 when the currency is the company base currency.',
    example: 89500,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @IsPositive()
  rate?: number;

  @ApiPropertyOptional({ description: 'Line memo.', example: 'Cash sale' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}
