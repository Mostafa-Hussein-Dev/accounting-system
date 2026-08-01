import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID } from 'class-validator';

const emptyToUndefined = ({ value }: { value: unknown }): unknown =>
  value === '' ? undefined : value;

export class OnHandQueryDto {
  @ApiProperty({ description: 'Item to report on.' })
  @IsUUID()
  itemId!: string;

  @ApiPropertyOptional({ description: 'Restrict to one variant.' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  variantId?: string;

  @ApiPropertyOptional({
    description: 'On-hand at ONE location; omit for the company-wide total.',
  })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  locationId?: string;

  @ApiPropertyOptional({ description: 'Platform admin: which company.' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  companyId?: string;
}

export class ValuationQueryDto {
  @ApiPropertyOptional({
    description: 'Value inventory as of this date (inclusive). Default: today.',
    example: '2026-08-01',
  })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  asOf?: string;

  @ApiPropertyOptional({ description: 'Platform admin: which company.' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  companyId?: string;
}

export class OnHandResponseDto {
  @ApiProperty() itemId!: string;
  @ApiPropertyOptional({ nullable: true }) variantId!: string | null;
  @ApiPropertyOptional({
    nullable: true,
    description: 'Null when reporting the company-wide total.',
  })
  locationId!: string | null;
  @ApiProperty({ example: 40 }) qty!: number;
  @ApiProperty({ description: 'Moving-average unit cost.', example: 4.5 })
  avgCost!: number;
  @ApiProperty({
    description: 'qty × avgCost, in base currency.',
    example: 180,
  })
  value!: number;
  @ApiProperty({ example: 'USD' }) currency!: string;
}

export class LocationStockDto {
  @ApiProperty() locationId!: string;
  @ApiProperty() locationCode!: string;
  @ApiProperty() qty!: number;
  @ApiProperty() value!: number;
}

export class VariantStockDto {
  @ApiPropertyOptional({ nullable: true }) variantId!: string | null;
  @ApiProperty() qty!: number;
  @ApiProperty() value!: number;
  @ApiProperty({ type: [LocationStockDto] }) locations!: LocationStockDto[];
}

export class ItemStockResponseDto {
  @ApiProperty() itemId!: string;
  @ApiProperty({ example: 40 }) totalQty!: number;
  @ApiProperty({ example: 180 }) totalValue!: number;
  @ApiProperty({ example: 'USD' }) currency!: string;
  @ApiProperty({ type: [VariantStockDto] }) breakdown!: VariantStockDto[];
}

export class ItemValuationRowDto {
  @ApiProperty() itemId!: string;
  @ApiProperty() qty!: number;
  @ApiProperty() value!: number;
}

export class ValuationResponseDto {
  @ApiProperty({ example: '2026-08-01' }) asOf!: string;
  @ApiProperty({ example: 12345.67 }) totalValue!: number;
  @ApiProperty({ example: 'USD' }) currency!: string;
  @ApiProperty({ type: [ItemValuationRowDto] }) items!: ItemValuationRowDto[];
}
