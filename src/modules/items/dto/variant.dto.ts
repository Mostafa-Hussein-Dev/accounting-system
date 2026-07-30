import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ItemVariant } from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

const emptyToUndefined = ({ value }: { value: unknown }): unknown =>
  value === '' ? undefined : value;

export class CreateVariantDto {
  @ApiPropertyOptional({
    description: 'Size (at least one of size/colour is required).',
  })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  sizeId?: string;

  @ApiPropertyOptional({
    description: 'Colour (at least one of size/colour is required).',
  })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  colourId?: string;

  @ApiPropertyOptional({ description: 'Optional SKU, unique per company.' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(64)
  sku?: string;
}

export class GenerateVariantsDto {
  @ApiPropertyOptional({
    type: [String],
    description: 'Sizes to include in the matrix.',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  sizeIds?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: 'Colours to include in the matrix.',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  colourIds?: string[];
}

export class UpdateVariantDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(64)
  sku?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// Used by the "delete all" body-less action too.
export class GenerateResultDto {
  @ApiProperty({ description: 'Variants created this call.', example: 6 })
  created!: number;
  @ApiProperty({
    description: 'Combinations skipped because they already existed.',
    example: 2,
  })
  skipped!: number;
}

export class VariantResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() itemId!: string;
  @ApiPropertyOptional({ nullable: true }) sizeId!: string | null;
  @ApiPropertyOptional({ nullable: true }) colourId!: string | null;
  @ApiPropertyOptional({ nullable: true }) sku!: string | null;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;

  static fromEntity(this: void, v: ItemVariant): VariantResponseDto {
    const dto = new VariantResponseDto();
    dto.id = v.id;
    dto.itemId = v.itemId;
    dto.sizeId = v.sizeId;
    dto.colourId = v.colourId;
    dto.sku = v.sku;
    dto.isActive = v.isActive;
    dto.createdAt = v.createdAt;
    dto.updatedAt = v.updatedAt;
    return dto;
  }
}
