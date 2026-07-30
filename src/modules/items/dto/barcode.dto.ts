import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ItemBarcode } from '@prisma/client';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

const emptyToUndefined = ({ value }: { value: unknown }): unknown =>
  value === '' ? undefined : value;

export class CreateBarcodeDto {
  @ApiProperty({ example: '6291041500213' })
  @IsString()
  @MaxLength(64)
  barcode!: string;

  @ApiPropertyOptional({
    description: 'Attach to a specific variant (must belong to the item).',
  })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  variantId?: string;

  @ApiPropertyOptional({
    description: 'Make this the item primary barcode.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class UpdateBarcodeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  barcode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class BarcodeResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() itemId!: string;
  @ApiPropertyOptional({ nullable: true }) variantId!: string | null;
  @ApiProperty({ example: '6291041500213' }) barcode!: string;
  @ApiProperty() isPrimary!: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;

  static fromEntity(this: void, b: ItemBarcode): BarcodeResponseDto {
    const dto = new BarcodeResponseDto();
    dto.id = b.id;
    dto.itemId = b.itemId;
    dto.variantId = b.variantId;
    dto.barcode = b.barcode;
    dto.isPrimary = b.isPrimary;
    dto.createdAt = b.createdAt;
    dto.updatedAt = b.updatedAt;
    return dto;
  }
}
