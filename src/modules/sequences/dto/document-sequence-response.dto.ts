import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DocumentSequence, DocumentType, ResetPeriod } from '@prisma/client';

export class DocumentSequenceResponseDto {
  @ApiProperty({ example: 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab' })
  id!: string;

  @ApiProperty({ example: '586b91ef-6b89-4e9b-bcaa-99976d65fc4a' })
  companyId!: string;

  @ApiPropertyOptional({ example: null, nullable: true })
  branchId!: string | null;

  @ApiProperty({ enum: DocumentType, example: DocumentType.SALES_INVOICE })
  docType!: DocumentType;

  @ApiProperty({ example: 'INV-' })
  prefix!: string;

  @ApiProperty({ example: '' })
  suffix!: string;

  @ApiProperty({ example: 4 })
  padWidth!: number;

  @ApiProperty({ enum: ResetPeriod, example: ResetPeriod.YEARLY })
  resetPeriod!: ResetPeriod;

  @ApiProperty({
    description: 'The next number that will be handed out',
    example: 1,
  })
  nextNumber!: number;

  @ApiPropertyOptional({
    description: 'Period the counter belongs to ("2026" / "2026-07" / "ALL")',
    example: '2026',
    nullable: true,
  })
  periodKey!: string | null;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  updatedAt!: Date;

  static fromEntity(
    this: void,
    seq: DocumentSequence,
  ): DocumentSequenceResponseDto {
    const dto = new DocumentSequenceResponseDto();
    dto.id = seq.id;
    dto.companyId = seq.companyId;
    dto.branchId = seq.branchId;
    dto.docType = seq.docType;
    dto.prefix = seq.prefix;
    dto.suffix = seq.suffix;
    dto.padWidth = seq.padWidth;
    dto.resetPeriod = seq.resetPeriod;
    dto.nextNumber = seq.nextNumber;
    dto.periodKey = seq.periodKey;
    dto.isActive = seq.isActive;
    dto.createdAt = seq.createdAt;
    dto.updatedAt = seq.updatedAt;
    return dto;
  }
}
