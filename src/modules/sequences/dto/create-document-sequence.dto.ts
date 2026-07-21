import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DocumentType, ResetPeriod } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateDocumentSequenceDto {
  @ApiProperty({ enum: DocumentType, example: DocumentType.SALES_INVOICE })
  @IsEnum(DocumentType)
  docType!: DocumentType;

  @ApiPropertyOptional({
    description:
      'Branch this series belongs to. Omit for a company-wide series (used when no branch-specific series exists).',
    example: 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab',
  })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional({
    description: 'Leading text',
    example: 'INV-',
    default: '',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  prefix?: string;

  @ApiPropertyOptional({
    description: 'Trailing text',
    example: '',
    default: '',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  suffix?: string;

  @ApiPropertyOptional({
    description: 'Zero-pad the counter to this width (e.g. 4 → 0001).',
    example: 4,
    default: 4,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  padWidth?: number;

  @ApiPropertyOptional({
    enum: ResetPeriod,
    example: ResetPeriod.YEARLY,
    default: ResetPeriod.YEARLY,
  })
  @IsOptional()
  @IsEnum(ResetPeriod)
  resetPeriod?: ResetPeriod;

  @ApiPropertyOptional({
    description:
      'The next number to hand out (lets you start a series partway).',
    example: 1,
    default: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  nextNumber?: number;

  @ApiPropertyOptional({
    description:
      'Company this series belongs to. A company-scoped caller is forced into their own company; a platform admin must supply it.',
    example: 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab',
  })
  @IsOptional()
  @IsUUID()
  companyId?: string;
}
