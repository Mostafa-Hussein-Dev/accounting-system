import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  StatementLineDto,
  StatementPresentationDto,
} from './income-statement-response.dto';

/** One balance sheet in a single base currency. */
export class BalanceSheetCurrencyGroupDto {
  @ApiProperty({ example: 'USD' })
  currency!: string;

  @ApiProperty({ type: StatementLineDto, isArray: true })
  assets!: StatementLineDto[];

  @ApiProperty({ example: 1000 })
  totalAssets!: number;

  @ApiProperty({ type: StatementLineDto, isArray: true })
  liabilities!: StatementLineDto[];

  @ApiProperty({ example: 400 })
  totalLiabilities!: number;

  @ApiProperty({
    type: StatementLineDto,
    isArray: true,
    description:
      'Equity accounts plus a synthetic "Result for the period" line (cumulative revenue − expenses up to asOf, until year-end close FR-904 rolls it into retained earnings).',
  })
  equity!: StatementLineDto[];

  @ApiProperty({ example: 600 })
  totalEquity!: number;

  @ApiProperty({
    description: 'totalAssets == totalLiabilities + totalEquity.',
    example: true,
  })
  isBalanced!: boolean;
}

/**
 * Balance sheet (FR-905): assets vs liabilities + equity as of a date, with the
 * current result folded into equity so it balances. Currency handling mirrors
 * the trial balance.
 */
export class BalanceSheetResponseDto {
  @ApiProperty() companyId!: string;
  @ApiProperty({ example: '2026-12-31' }) asOf!: string;
  @ApiProperty() rolledUp!: boolean;

  @ApiProperty({ nullable: true }) currency!: string | null;

  @ApiProperty({ type: StatementLineDto, isArray: true })
  assets!: StatementLineDto[];

  @ApiProperty({ nullable: true }) totalAssets!: number | null;

  @ApiProperty({ type: StatementLineDto, isArray: true })
  liabilities!: StatementLineDto[];

  @ApiProperty({ nullable: true }) totalLiabilities!: number | null;

  @ApiProperty({ type: StatementLineDto, isArray: true })
  equity!: StatementLineDto[];

  @ApiProperty({ nullable: true }) totalEquity!: number | null;

  @ApiProperty({
    description:
      'Whether assets equal liabilities + equity. For a mixed scope, true only when every per-currency sheet balances.',
    example: true,
  })
  isBalanced!: boolean;

  @ApiPropertyOptional({
    type: BalanceSheetCurrencyGroupDto,
    isArray: true,
    nullable: true,
    description:
      'One sheet per base currency; only for a mixed scope without presentIn.',
  })
  byBaseCurrency?: BalanceSheetCurrencyGroupDto[] | null;

  @ApiPropertyOptional({ type: StatementPresentationDto, nullable: true })
  presentation?: StatementPresentationDto | null;
}
