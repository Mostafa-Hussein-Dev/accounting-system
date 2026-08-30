import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { FiscalPeriodStatus } from '@prisma/client';

export class QueryFiscalPeriodsDto {
  @ApiPropertyOptional({
    description:
      'Return the 12 months of this year (each OPEN unless a row locks it).',
    example: 2026,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;

  @ApiPropertyOptional({ description: 'Platform admin: which company.' })
  @IsOptional()
  @IsUUID()
  companyId?: string;
}

export class PeriodRefDto {
  @ApiProperty({ example: 2026 })
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;

  @ApiProperty({ example: 7, description: 'Month 1–12.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @ApiPropertyOptional({ description: 'Platform admin: which company.' })
  @IsOptional()
  @IsUUID()
  companyId?: string;
}

export class CloseYearDto {
  @ApiProperty({ example: 2026, description: 'Fiscal year to close.' })
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;

  @ApiPropertyOptional({ description: 'Platform admin: which company.' })
  @IsOptional()
  @IsUUID()
  companyId?: string;
}

export class FiscalPeriodResponseDto {
  @ApiPropertyOptional({
    nullable: true,
    description: 'Null for an unmaterialised (implicitly open) month.',
  })
  id!: string | null;
  @ApiProperty() year!: number;
  @ApiProperty({ example: 7 }) month!: number;
  @ApiProperty({ enum: FiscalPeriodStatus }) status!: FiscalPeriodStatus;
  @ApiPropertyOptional({ nullable: true }) lockedAt!: Date | null;
}

export class ClosingEntryDto {
  @ApiProperty({ example: 'USD' }) currency!: string;
  @ApiProperty({
    description: 'Net result rolled to retained earnings (profit if > 0).',
    example: 32,
  })
  netResult!: number;
  @ApiProperty() journalEntryId!: string;
}

export class CloseYearResultDto {
  @ApiProperty() companyId!: string;
  @ApiProperty({ example: 2026 }) year!: number;
  @ApiProperty({ example: '2026-01-01' }) from!: string;
  @ApiProperty({ example: '2026-12-31' }) to!: string;
  @ApiProperty({ type: ClosingEntryDto, isArray: true })
  closingEntries!: ClosingEntryDto[];
  @ApiProperty({ type: [Number], description: 'Months locked by the close.' })
  lockedMonths!: number[];
}
