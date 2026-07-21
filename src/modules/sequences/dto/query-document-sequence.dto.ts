import { ApiPropertyOptional } from '@nestjs/swagger';
import { DocumentType } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class QueryDocumentSequenceDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: DocumentType,
    description: 'Filter by document type',
  })
  @IsOptional()
  @IsEnum(DocumentType)
  docType?: DocumentType;

  @ApiPropertyOptional({
    description: 'Filter by branch',
    example: 'b3f1c2e0-...',
  })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional({
    description:
      'Platform admin: which company to list. Ignored for a company-scoped caller.',
    example: 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab',
  })
  @IsOptional()
  @IsUUID()
  companyId?: string;
}
