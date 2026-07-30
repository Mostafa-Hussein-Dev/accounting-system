import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { PricelistLine } from '@prisma/client';
import { IsNumber, IsOptional, IsPositive, IsUUID } from 'class-validator';

const emptyToUndefined = ({ value }: { value: unknown }): unknown =>
  value === '' ? undefined : value;

export class CreatePricelistLineDto {
  @ApiProperty({ description: 'Item this price applies to.' })
  @IsUUID()
  itemId!: string;

  @ApiPropertyOptional({
    description: 'A specific variant (must belong to the item).',
  })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  variantId?: string;

  @ApiProperty({
    description: 'Fixed sale price in the list currency.',
    example: 8950000,
  })
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  price!: number;

  @ApiPropertyOptional({
    description: 'Quantity break: this price applies at/above this qty.',
    default: 1,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  minQty?: number;
}

export class UpdatePricelistLineDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  price?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  minQty?: number;
}

export class PricelistLineResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() pricelistId!: string;
  @ApiProperty() itemId!: string;
  @ApiPropertyOptional({ nullable: true }) variantId!: string | null;
  @ApiProperty({ example: 8950000 }) price!: number;
  @ApiProperty({ example: 1 }) minQty!: number;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;

  static fromEntity(this: void, l: PricelistLine): PricelistLineResponseDto {
    const dto = new PricelistLineResponseDto();
    dto.id = l.id;
    dto.pricelistId = l.pricelistId;
    dto.itemId = l.itemId;
    dto.variantId = l.variantId;
    dto.price = Number(l.price);
    dto.minQty = Number(l.minQty);
    dto.createdAt = l.createdAt;
    dto.updatedAt = l.updatedAt;
    return dto;
  }
}

export class ResolvedPriceDto {
  @ApiProperty() itemId!: string;
  @ApiPropertyOptional({ nullable: true }) variantId!: string | null;
  @ApiProperty({ example: 3 }) qty!: number;
  @ApiProperty({ description: 'The resolved unit price.', example: 8950000 })
  price!: number;
  @ApiProperty({ example: 'LBP' }) currency!: string;
  @ApiProperty({ enum: ['pricelist', 'item'], example: 'pricelist' }) source!:
    'pricelist' | 'item';
  @ApiPropertyOptional({ nullable: true }) pricelistId!: string | null;
}
