import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { toBoolean } from '../../../common/dto/query-transformers';

export class QueryPartnersDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Only customers.', example: true })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isCustomer?: boolean;

  @ApiPropertyOptional({ description: 'Only suppliers.', example: true })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isSupplier?: boolean;

  @ApiPropertyOptional({ description: 'Filter by active flag.', example: true })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Case-insensitive search over ref, name, and tin.',
    example: 'acme',
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    description:
      'Platform admin: which company to list. Ignored for a company-scoped caller.',
    example: 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab',
  })
  @IsOptional()
  @IsUUID()
  companyId?: string;
}
