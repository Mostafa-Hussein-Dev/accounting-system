import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { StockMovement, StockMovementType } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

const emptyToUndefined = ({ value }: { value: unknown }): unknown =>
  value === '' ? undefined : value;

export class CreateMovementDto {
  @ApiProperty({ enum: StockMovementType, example: StockMovementType.RECEIPT })
  @IsEnum(StockMovementType)
  type!: StockMovementType;

  @ApiPropertyOptional({
    description: 'Movement date (defaults to today). Drives the STK- number.',
    example: '2026-08-01',
  })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  movementDate?: string;

  @ApiProperty()
  @IsUUID()
  itemId!: string;

  @ApiPropertyOptional({
    description: 'Required when the item has size/colour variants.',
  })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  variantId?: string;

  @ApiPropertyOptional({
    description:
      'The external counterparty. REQUIRED for receipts (a supplier) and issues (a customer); must be OMITTED for internal transfers/adjustments.',
  })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  partnerId?: string;

  @ApiProperty({ description: 'Source location.' })
  @IsUUID()
  fromLocationId!: string;

  @ApiProperty({ description: 'Destination location.' })
  @IsUUID()
  toLocationId!: string;

  @ApiProperty({
    description: 'Quantity moved (in `uomId`, else base UoM).',
    example: 10,
  })
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  qty!: number;

  @ApiPropertyOptional({
    description:
      'Input UoM (same category as the item base UoM); converted to base.',
  })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  uomId?: string;

  @ApiPropertyOptional({
    description:
      'Unit cost in base currency. Required for inbound moves (RECEIPT/OPENING/adjustment-in); ignored otherwise (valued at moving average).',
    example: 4.5,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  unitCost?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;

  @ApiPropertyOptional({
    description: 'Branch this movement is attributed to.',
  })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional({
    description: 'Platform admin: which company. Ignored for a company caller.',
  })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  companyId?: string;

  // Set by document flows (e.g. goods receipt) to link the movement back to its
  // source; not part of the public manual API surface.
  sourceDocType?: string;
  sourceDocId?: string;
}

export class QueryMovementDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  itemId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  variantId?: string;

  @ApiPropertyOptional({
    description: 'Movements touching this location (either side).',
  })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  locationId?: string;

  @ApiPropertyOptional({ description: 'Movements for this partner.' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  partnerId?: string;

  @ApiPropertyOptional({ enum: StockMovementType })
  @IsOptional()
  @IsEnum(StockMovementType)
  type?: StockMovementType;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  to?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  companyId?: string;
}

export class MovementResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() companyId!: string;
  @ApiProperty({ example: 'STK-2026-0001' }) movementNo!: string;
  @ApiProperty({ enum: StockMovementType }) type!: StockMovementType;
  @ApiProperty() movementDate!: Date;
  @ApiProperty() itemId!: string;
  @ApiPropertyOptional({ nullable: true }) variantId!: string | null;
  @ApiProperty() fromLocationId!: string;
  @ApiProperty() toLocationId!: string;
  @ApiPropertyOptional({ nullable: true }) partnerId!: string | null;
  @ApiProperty({ description: 'Quantity in the item base UoM.', example: 10 })
  qty!: number;
  @ApiProperty({ example: 4.5 }) unitCost!: number;
  @ApiProperty({ example: 45 }) value!: number;
  @ApiProperty({ example: 'USD' }) costCurrency!: string;
  @ApiPropertyOptional({ nullable: true }) reason!: string | null;
  @ApiPropertyOptional({ nullable: true }) reference!: string | null;
  @ApiPropertyOptional({ nullable: true }) branchId!: string | null;
  @ApiProperty() createdAt!: Date;

  static fromEntity(this: void, m: StockMovement): MovementResponseDto {
    const dto = new MovementResponseDto();
    dto.id = m.id;
    dto.companyId = m.companyId;
    dto.movementNo = m.movementNo;
    dto.type = m.type;
    dto.movementDate = m.movementDate;
    dto.itemId = m.itemId;
    dto.variantId = m.variantId;
    dto.fromLocationId = m.fromLocationId;
    dto.toLocationId = m.toLocationId;
    dto.partnerId = m.partnerId;
    dto.qty = Number(m.qty);
    dto.unitCost = Number(m.unitCost);
    dto.value = Number(m.value);
    dto.costCurrency = m.costCurrency;
    dto.reason = m.reason;
    dto.reference = m.reference;
    dto.branchId = m.branchId;
    dto.createdAt = m.createdAt;
    return dto;
  }
}
