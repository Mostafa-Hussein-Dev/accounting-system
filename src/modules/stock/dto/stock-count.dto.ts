import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { StockCountStatus } from '@prisma/client';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const emptyToUndefined = ({ value }: { value: unknown }): unknown =>
  value === '' ? undefined : value;

// One counted line: the item/variant physically counted at the location and the
// quantity found. unitCost is only used for a positive variance (found stock);
// it defaults to the current moving average.
export class CreateStockCountLineDto {
  @ApiProperty()
  @IsUUID()
  itemId!: string;

  @ApiPropertyOptional({ description: 'Required when the item has variants.' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  variantId?: string;

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
      'Unit cost (base) for a positive variance; defaults to the current moving average.',
    example: 4.5,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  unitCost?: number;
}

export class CreateStockCountDto {
  @ApiProperty({ description: 'The internal location being counted.' })
  @IsUUID()
  locationId!: string;

  @ApiPropertyOptional({
    example: '2026-08-01',
    description: 'Defaults today.',
  })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  countDate?: string;

  @ApiPropertyOptional({
    description: 'Branch attributed to (drives the number).',
  })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiProperty({ type: [CreateStockCountLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateStockCountLineDto)
  lines!: CreateStockCountLineDto[];

  @ApiPropertyOptional({
    description: 'Platform admin: which company. Ignored for a company caller.',
  })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  companyId?: string;
}

export class QueryStockCountDto {
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

  @ApiPropertyOptional({ enum: StockCountStatus })
  @IsOptional()
  @IsEnum(StockCountStatus)
  status?: StockCountStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  locationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  companyId?: string;
}

// --- responses -------------------------------------------------------------

interface StockCountLineEntity {
  id: string;
  lineNo: number;
  itemId: string;
  variantId: string | null;
  uomId: string | null;
  systemQty: unknown;
  countedQty: unknown;
  unitCost: unknown;
  varianceQty: unknown;
  varianceValueBase: unknown;
  stockMovementId: string | null;
}

interface StockCountEntity {
  id: string;
  companyId: string;
  countNo: string;
  status: StockCountStatus;
  countDate: Date;
  branchId: string | null;
  locationId: string;
  notes: string | null;
  varianceValueBase: unknown;
  journalEntryId: string | null;
  postedAt: Date | null;
  createdAt: Date;
  lines?: StockCountLineEntity[];
}

export class StockCountLineResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() lineNo!: number;
  @ApiProperty() itemId!: string;
  @ApiPropertyOptional({ nullable: true }) variantId!: string | null;
  @ApiPropertyOptional({ nullable: true }) uomId!: string | null;
  @ApiProperty({ description: 'On-hand snapshot at creation (base UoM).' })
  systemQty!: number;
  @ApiProperty() countedQty!: number;
  @ApiPropertyOptional({ nullable: true }) unitCost!: number | null;
  @ApiProperty({ description: 'counted − current on-hand, frozen at post.' })
  varianceQty!: number;
  @ApiProperty() varianceValueBase!: number;
  @ApiPropertyOptional({ nullable: true }) stockMovementId!: string | null;

  static fromEntity(
    this: void,
    l: StockCountLineEntity,
  ): StockCountLineResponseDto {
    const dto = new StockCountLineResponseDto();
    dto.id = l.id;
    dto.lineNo = l.lineNo;
    dto.itemId = l.itemId;
    dto.variantId = l.variantId;
    dto.uomId = l.uomId;
    dto.systemQty = Number(l.systemQty);
    dto.countedQty = Number(l.countedQty);
    dto.unitCost = l.unitCost == null ? null : Number(l.unitCost);
    dto.varianceQty = Number(l.varianceQty);
    dto.varianceValueBase = Number(l.varianceValueBase);
    dto.stockMovementId = l.stockMovementId;
    return dto;
  }
}

export class StockCountResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() companyId!: string;
  @ApiProperty({ example: 'CNT-2026-0001' }) countNo!: string;
  @ApiProperty({ enum: StockCountStatus }) status!: StockCountStatus;
  @ApiProperty() countDate!: Date;
  @ApiPropertyOptional({ nullable: true }) branchId!: string | null;
  @ApiProperty() locationId!: string;
  @ApiPropertyOptional({ nullable: true }) notes!: string | null;
  @ApiProperty({ description: 'Net variance value posted (base).' })
  varianceValueBase!: number;
  @ApiPropertyOptional({ nullable: true }) journalEntryId!: string | null;
  @ApiPropertyOptional({ nullable: true }) postedAt!: Date | null;
  @ApiProperty() createdAt!: Date;
  @ApiPropertyOptional({ type: [StockCountLineResponseDto] })
  lines?: StockCountLineResponseDto[];

  static fromEntity(this: void, c: StockCountEntity): StockCountResponseDto {
    const dto = new StockCountResponseDto();
    dto.id = c.id;
    dto.companyId = c.companyId;
    dto.countNo = c.countNo;
    dto.status = c.status;
    dto.countDate = c.countDate;
    dto.branchId = c.branchId;
    dto.locationId = c.locationId;
    dto.notes = c.notes;
    dto.varianceValueBase = Number(c.varianceValueBase);
    dto.journalEntryId = c.journalEntryId;
    dto.postedAt = c.postedAt;
    dto.createdAt = c.createdAt;
    if (c.lines) dto.lines = c.lines.map(StockCountLineResponseDto.fromEntity);
    return dto;
  }
}
