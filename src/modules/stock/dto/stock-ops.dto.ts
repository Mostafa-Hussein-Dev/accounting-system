import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

const emptyToUndefined = ({ value }: { value: unknown }): unknown =>
  value === '' ? undefined : value;

// Count-based stock adjustment: state the counted quantity and the service
// posts the delta against the ADJUSTMENT location (up = inbound at unitCost,
// down = outbound at the moving average).
export class AdjustStockDto {
  @ApiProperty()
  @IsUUID()
  itemId!: string;

  @ApiPropertyOptional({ description: 'Required when the item has variants.' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  variantId?: string;

  @ApiProperty({ description: 'The internal location being counted.' })
  @IsUUID()
  locationId!: string;

  @ApiProperty({ description: 'Physically counted quantity.', example: 42 })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  countedQty!: number;

  @ApiPropertyOptional({
    description:
      'Input UoM (converted to base); defaults to the item base UoM.',
  })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  uomId?: string;

  @ApiPropertyOptional({
    description:
      'Unit cost for an upward adjustment (inbound). Required if the count is higher than on-hand.',
    example: 4.5,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  unitCost?: number;

  @ApiPropertyOptional({ example: '2026-08-01' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  movementDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  companyId?: string;
}

// Internal-to-internal transfer (value-neutral; quantity relocates).
export class TransferStockDto {
  @ApiProperty()
  @IsUUID()
  itemId!: string;

  @ApiPropertyOptional({ description: 'Required when the item has variants.' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  variantId?: string;

  @ApiProperty()
  @IsUUID()
  fromLocationId!: string;

  @ApiProperty()
  @IsUUID()
  toLocationId!: string;

  @ApiProperty({ example: 5 })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  qty!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  uomId?: string;

  @ApiPropertyOptional({ example: '2026-08-01' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  movementDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  companyId?: string;
}
