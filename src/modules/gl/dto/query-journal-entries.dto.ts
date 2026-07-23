import { ApiPropertyOptional } from '@nestjs/swagger';
import { JournalStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class QueryJournalEntriesDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: JournalStatus, description: 'Filter by status' })
  @IsOptional()
  @IsEnum(JournalStatus)
  status?: JournalStatus;

  @ApiPropertyOptional({
    description: 'Only entries dated on or after this date (inclusive).',
    example: '2026-01-01',
  })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({
    description: 'Only entries dated on or before this date (inclusive).',
    example: '2026-12-31',
  })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({
    description: 'Only entries that touch this account.',
    example: 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab',
  })
  @IsOptional()
  @IsUUID()
  accountId?: string;

  @ApiPropertyOptional({
    description:
      'Platform admin: which company to list. Ignored for a company-scoped caller.',
    example: 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab',
  })
  @IsOptional()
  @IsUUID()
  companyId?: string;
}
