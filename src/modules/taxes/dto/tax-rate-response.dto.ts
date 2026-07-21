import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TaxRate, TaxTreatment } from '@prisma/client';

export class TaxRateResponseDto {
  @ApiProperty({ example: 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab' })
  id!: string;

  @ApiProperty({ example: '586b91ef-6b89-4e9b-bcaa-99976d65fc4a' })
  companyId!: string;

  @ApiProperty({ example: 'Standard VAT 11%' })
  name!: string;

  @ApiProperty({ description: 'Percentage', example: 11 })
  ratePct!: number;

  @ApiProperty({ enum: TaxTreatment, example: TaxTreatment.STANDARD })
  treatment!: TaxTreatment;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  effectiveDate!: Date;

  @ApiPropertyOptional({ example: 'a1b2c3d4-...', nullable: true })
  vatOutAccountId!: string | null;

  @ApiPropertyOptional({ example: 'a1b2c3d4-...', nullable: true })
  vatInAccountId!: string | null;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  updatedAt!: Date;

  static fromEntity(this: void, taxRate: TaxRate): TaxRateResponseDto {
    const dto = new TaxRateResponseDto();
    dto.id = taxRate.id;
    dto.companyId = taxRate.companyId;
    dto.name = taxRate.name;
    // Prisma Decimal -> plain number for the JSON response.
    dto.ratePct = Number(taxRate.ratePct);
    dto.treatment = taxRate.treatment;
    dto.effectiveDate = taxRate.effectiveDate;
    dto.vatOutAccountId = taxRate.vatOutAccountId;
    dto.vatInAccountId = taxRate.vatInAccountId;
    dto.isActive = taxRate.isActive;
    dto.createdAt = taxRate.createdAt;
    dto.updatedAt = taxRate.updatedAt;
    return dto;
  }
}
