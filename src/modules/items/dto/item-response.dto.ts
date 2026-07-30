import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Item, TaxTreatment } from '@prisma/client';

export class ItemResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() companyId!: string;
  @ApiProperty({ example: 'SKU-1001' }) code!: string;
  @ApiProperty({ example: 'Wireless Mouse' }) name!: string;
  @ApiPropertyOptional({ nullable: true }) nameAr!: string | null;
  @ApiPropertyOptional({ nullable: true }) nameFr!: string | null;
  @ApiPropertyOptional({ nullable: true }) nameEn!: string | null;
  @ApiPropertyOptional({ nullable: true }) description!: string | null;
  @ApiPropertyOptional({ nullable: true }) categoryId!: string | null;
  @ApiPropertyOptional({ nullable: true }) brandId!: string | null;
  @ApiPropertyOptional({ nullable: true }) familyId!: string | null;
  @ApiProperty() baseUomId!: string;
  @ApiPropertyOptional({ nullable: true }) salesUomId!: string | null;
  @ApiPropertyOptional({ nullable: true }) purchaseUomId!: string | null;
  @ApiProperty({ example: 5.5 }) costPrice!: number;
  @ApiProperty({ example: 9.99 }) salePrice!: number;
  @ApiProperty({ example: 'USD' }) priceCurrency!: string;
  @ApiProperty({ enum: TaxTreatment }) vatTreatment!: TaxTreatment;
  @ApiPropertyOptional({ nullable: true }) defaultTaxRateId!: string | null;
  @ApiProperty() hasSize!: boolean;
  @ApiProperty() hasColour!: boolean;
  @ApiProperty() trackSerial!: boolean;
  @ApiProperty() trackExpiry!: boolean;
  @ApiProperty({ type: [String] }) imageUrls!: string[];
  @ApiProperty() isActive!: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;

  static fromEntity(this: void, i: Item): ItemResponseDto {
    const dto = new ItemResponseDto();
    dto.id = i.id;
    dto.companyId = i.companyId;
    dto.code = i.code;
    dto.name = i.name;
    dto.nameAr = i.nameAr;
    dto.nameFr = i.nameFr;
    dto.nameEn = i.nameEn;
    dto.description = i.description;
    dto.categoryId = i.categoryId;
    dto.brandId = i.brandId;
    dto.familyId = i.familyId;
    dto.baseUomId = i.baseUomId;
    dto.salesUomId = i.salesUomId;
    dto.purchaseUomId = i.purchaseUomId;
    dto.costPrice = Number(i.costPrice);
    dto.salePrice = Number(i.salePrice);
    dto.priceCurrency = i.priceCurrency;
    dto.vatTreatment = i.vatTreatment;
    dto.defaultTaxRateId = i.defaultTaxRateId;
    dto.hasSize = i.hasSize;
    dto.hasColour = i.hasColour;
    dto.trackSerial = i.trackSerial;
    dto.trackExpiry = i.trackExpiry;
    dto.imageUrls = i.imageUrls;
    dto.isActive = i.isActive;
    dto.createdAt = i.createdAt;
    dto.updatedAt = i.updatedAt;
    return dto;
  }
}
