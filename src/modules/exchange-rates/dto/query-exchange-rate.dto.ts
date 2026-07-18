import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

// Filters for the exchange-rate history list. All optional — combined with AND.
export class QueryExchangeRateDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by currency (ISO 4217 code)',
    example: 'LBP',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currencyCode?: string;

  @ApiPropertyOptional({
    description: 'Filter by rate type',
    example: 'Official',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  rateType?: string;

  @ApiPropertyOptional({
    description: 'Only rates effective on or after this date (inclusive)',
    example: '2026-01-01',
  })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({
    description: 'Only rates effective on or before this date (inclusive)',
    example: '2026-12-31',
  })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({
    description:
      'Platform admin only: narrow to one company. Ignored for company-scoped callers (always their own company).',
    example: 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab',
  })
  @IsOptional()
  @IsUUID()
  companyId?: string;
}
