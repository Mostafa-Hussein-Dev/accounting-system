import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TaxTreatment } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';

export class CurrentTaxRateDto {
  @ApiProperty({
    enum: TaxTreatment,
    description: 'Treatment whose in-force rate you want',
    example: TaxTreatment.STANDARD,
  })
  @IsEnum(TaxTreatment)
  treatment!: TaxTreatment;

  @ApiPropertyOptional({
    description: 'Date to resolve the rate on (ISO 8601). Defaults to today.',
    example: '2026-07-21',
  })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiPropertyOptional({
    description:
      'Platform admin: which company. Ignored for a company-scoped caller.',
    example: 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab',
  })
  @IsOptional()
  @IsUUID()
  companyId?: string;
}
