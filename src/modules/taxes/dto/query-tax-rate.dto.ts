import { ApiPropertyOptional } from '@nestjs/swagger';
import { TaxTreatment } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class QueryTaxRateDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: TaxTreatment,
    description: 'Filter by treatment',
  })
  @IsOptional()
  @IsEnum(TaxTreatment)
  treatment?: TaxTreatment;

  @ApiPropertyOptional({
    description:
      'Platform admin: which company to list. Ignored for a company-scoped caller.',
    example: 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab',
  })
  @IsOptional()
  @IsUUID()
  companyId?: string;
}
