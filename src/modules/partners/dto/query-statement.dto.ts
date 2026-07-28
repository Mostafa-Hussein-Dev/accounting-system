import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';

export class QueryStatementDto {
  @ApiProperty({
    description:
      'Statement start date (inclusive). Everything before it forms the opening balance.',
    example: '2026-01-01',
  })
  @IsDateString()
  from!: string;

  @ApiPropertyOptional({
    description: 'Statement end date (inclusive). Defaults to today.',
    example: '2026-12-31',
  })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    description:
      'Exchange-rate type used for the LBP-converted columns (rate in force on the "to" date). Defaults to Official.',
    example: 'Official',
    default: 'Official',
  })
  @IsOptional()
  @IsString()
  rateType?: string;

  @ApiPropertyOptional({
    description:
      'Platform admin: which company. Ignored for a company-scoped caller.',
    example: 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab',
  })
  @IsOptional()
  @IsUUID()
  companyId?: string;
}
