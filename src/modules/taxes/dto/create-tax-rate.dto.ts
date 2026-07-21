import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TaxTreatment } from '@prisma/client';
import {
  IsEnum,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateTaxRateDto {
  @ApiProperty({
    description: 'Human label for the rate',
    example: 'Standard VAT 11%',
  })
  @IsString()
  @MaxLength(100)
  name!: string;

  @ApiProperty({
    description:
      'Percentage (0–100). Must be 0 for zero-rated/exempt treatments.',
    example: 11,
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  ratePct!: number;

  @ApiProperty({ enum: TaxTreatment, example: TaxTreatment.STANDARD })
  @IsEnum(TaxTreatment)
  treatment!: TaxTreatment;

  @ApiProperty({
    description:
      'Date this rate takes effect (ISO 8601). The rate in force on a document date is the newest one on or before it.',
    example: '2026-01-01',
  })
  @IsDateString()
  effectiveDate!: string;

  @ApiPropertyOptional({
    description:
      'Output-VAT account (class 44, controlType VAT_OUT). Required for STANDARD; must be omitted for zero/exempt.',
    example: 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab',
  })
  @IsOptional()
  @IsUUID()
  vatOutAccountId?: string;

  @ApiPropertyOptional({
    description:
      'Input-VAT account (class 44, controlType VAT_IN). Required for STANDARD; must be omitted for zero/exempt.',
    example: 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab',
  })
  @IsOptional()
  @IsUUID()
  vatInAccountId?: string;

  @ApiPropertyOptional({
    description:
      'Company this rate belongs to. A company-scoped caller is always forced into their own company — this is ignored/overridden. A platform admin must target a company via this field.',
    example: 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab',
  })
  @IsOptional()
  @IsUUID()
  companyId?: string;
}
