import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { TaxTreatment } from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
  MaxLength,
} from 'class-validator';

const emptyToUndefined = ({ value }: { value: unknown }): unknown =>
  value === '' ? undefined : value;

export class CreateItemDto {
  @ApiProperty({
    description: 'Unique item code per company.',
    example: 'SKU-1001',
  })
  @IsString()
  @MaxLength(64)
  code!: string;

  @ApiProperty({ example: 'Wireless Mouse' })
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameAr?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameFr?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameEn?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  categoryId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  brandId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  familyId?: string;

  @ApiProperty({
    description: 'Base unit of measure (stock is kept in this unit).',
  })
  @IsUUID()
  baseUomId!: string;

  @ApiPropertyOptional({ description: 'Sales UoM (same category as base).' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  salesUomId?: string;

  @ApiPropertyOptional({ description: 'Purchase UoM (same category as base).' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  purchaseUomId?: string;

  @ApiPropertyOptional({ example: 5.5, default: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  costPrice?: number;

  @ApiPropertyOptional({ example: 9.99, default: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  salePrice?: number;

  @ApiPropertyOptional({
    description:
      'Currency of the base cost/sale price. Defaults to the company base currency.',
    example: 'USD',
  })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @Length(3, 3)
  priceCurrency?: string;

  @ApiPropertyOptional({ enum: TaxTreatment, default: TaxTreatment.STANDARD })
  @IsOptional()
  @IsEnum(TaxTreatment)
  vatTreatment?: TaxTreatment;

  @ApiPropertyOptional({
    description: 'Default VAT rate for this item (tax_rates id).',
  })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  defaultTaxRateId?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  hasSize?: boolean;
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  hasColour?: boolean;
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  trackSerial?: boolean;
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  trackExpiry?: boolean;

  @ApiPropertyOptional({
    default: true,
    description:
      'Perpetual inventory: a stock item relieves stock + posts COGS on sale. Set false for services/non-stock items (revenue + VAT only).',
  })
  @IsOptional()
  @IsBoolean()
  trackInventory?: boolean;

  @ApiPropertyOptional({
    description:
      'Revenue account override for sales (FR-6xx). Falls back to the category, then the company REVENUE control account.',
  })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  revenueAccountId?: string;

  @ApiPropertyOptional({
    description:
      'COGS account override for sales (FR-6xx). Falls back to the category, then the company COGS control account.',
  })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  cogsAccountId?: string;

  @ApiPropertyOptional({
    description: 'Image URLs (stored as-is; upload/storage is out of scope).',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  imageUrls?: string[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description:
      'Platform admin: which company. Ignored for a company-scoped caller.',
  })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  companyId?: string;
}
