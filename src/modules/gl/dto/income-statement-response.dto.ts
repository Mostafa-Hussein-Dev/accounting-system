import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PresentationRateDto } from './account-balance-response.dto';

export class StatementLineDto {
  @ApiProperty({
    description: 'Account id — empty on a rolled-up (class) row.',
  })
  accountId!: string;

  @ApiProperty({
    description: 'Account number, or the class key when rolled up.',
    example: '70',
  })
  accountNumber!: string;

  @ApiProperty({ example: 'Sales' })
  accountName!: string;

  @ApiProperty({
    description: 'Net amount for the line (positive in its natural direction).',
    example: 100,
  })
  amount!: number;
}

/** One income statement in a single base currency. */
export class IncomeStatementCurrencyGroupDto {
  @ApiProperty({ example: 'USD' })
  currency!: string;

  @ApiProperty({ type: StatementLineDto, isArray: true })
  revenue!: StatementLineDto[];

  @ApiProperty({ example: 100 })
  totalRevenue!: number;

  @ApiProperty({ type: StatementLineDto, isArray: true })
  expenses!: StatementLineDto[];

  @ApiProperty({ example: 50 })
  totalExpenses!: number;

  @ApiProperty({
    description: 'totalRevenue − totalExpenses (profit if > 0).',
    example: 50,
  })
  netResult!: number;
}

export class StatementPresentationDto {
  @ApiProperty({ example: 'USD' })
  currency!: string;

  @ApiProperty({ example: true })
  converted!: boolean;

  @ApiProperty({ type: PresentationRateDto, isArray: true })
  rates!: PresentationRateDto[];
}

/**
 * Income statement (FR-905): revenue (class 7) − expenses (class 6) over a
 * period = net result. Currency handling mirrors the trial balance.
 */
export class IncomeStatementResponseDto {
  @ApiProperty() companyId!: string;
  @ApiProperty({ example: '2026-01-01' }) from!: string;
  @ApiProperty({ example: '2026-12-31' }) to!: string;
  @ApiProperty() rolledUp!: boolean;

  @ApiProperty({ nullable: true }) currency!: string | null;

  @ApiProperty({ type: StatementLineDto, isArray: true })
  revenue!: StatementLineDto[];

  @ApiProperty({ nullable: true }) totalRevenue!: number | null;

  @ApiProperty({ type: StatementLineDto, isArray: true })
  expenses!: StatementLineDto[];

  @ApiProperty({ nullable: true }) totalExpenses!: number | null;
  @ApiProperty({ nullable: true }) netResult!: number | null;

  @ApiPropertyOptional({
    type: IncomeStatementCurrencyGroupDto,
    isArray: true,
    nullable: true,
    description:
      'One statement per base currency; only for a mixed scope without presentIn.',
  })
  byBaseCurrency?: IncomeStatementCurrencyGroupDto[] | null;

  @ApiPropertyOptional({ type: StatementPresentationDto, nullable: true })
  presentation?: StatementPresentationDto | null;
}
