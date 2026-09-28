import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { StockTransferStatus } from '@prisma/client';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const emptyToUndefined = ({ value }: { value: unknown }): unknown =>
  value === '' ? undefined : value;

export class CreateStockTransferLineDto {
  @ApiProperty()
  @IsUUID()
  itemId!: string;

  @ApiPropertyOptional({ description: 'Required when the item has variants.' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  variantId?: string;

  @ApiProperty({ description: 'Quantity to transfer.', example: 5 })
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  qty!: number;

  @ApiPropertyOptional({
    description:
      'Input UoM (converted to base); defaults to the item base UoM.',
  })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  uomId?: string;
}

export class CreateStockTransferDto {
  @ApiProperty({ description: 'Source internal location.' })
  @IsUUID()
  fromLocationId!: string;

  @ApiProperty({ description: 'Destination internal location.' })
  @IsUUID()
  toLocationId!: string;

  @ApiPropertyOptional({
    example: '2026-08-01',
    description: 'Defaults today.',
  })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  transferDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiProperty({ type: [CreateStockTransferLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateStockTransferLineDto)
  lines!: CreateStockTransferLineDto[];

  @ApiPropertyOptional({
    description: 'Platform admin: which company. Ignored for a company caller.',
  })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  companyId?: string;
}

export class QueryStockTransferDto {
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

  @ApiPropertyOptional({ enum: StockTransferStatus })
  @IsOptional()
  @IsEnum(StockTransferStatus)
  status?: StockTransferStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  companyId?: string;
}

// --- responses -------------------------------------------------------------

interface StockTransferLineEntity {
  id: string;
  lineNo: number;
  itemId: string;
  variantId: string | null;
  uomId: string | null;
  qty: unknown;
  stockMovementId: string | null;
}

interface StockTransferEntity {
  id: string;
  companyId: string;
  transferNo: string;
  status: StockTransferStatus;
  transferDate: Date;
  fromLocationId: string;
  toLocationId: string;
  fromBranchId: string | null;
  toBranchId: string | null;
  notes: string | null;
  approvedById: string | null;
  approvedAt: Date | null;
  postedAt: Date | null;
  createdAt: Date;
  lines?: StockTransferLineEntity[];
}

export class StockTransferLineResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() lineNo!: number;
  @ApiProperty() itemId!: string;
  @ApiPropertyOptional({ nullable: true }) variantId!: string | null;
  @ApiPropertyOptional({ nullable: true }) uomId!: string | null;
  @ApiProperty({ description: 'Quantity in the item base UoM.' }) qty!: number;
  @ApiPropertyOptional({ nullable: true }) stockMovementId!: string | null;

  static fromEntity(
    this: void,
    l: StockTransferLineEntity,
  ): StockTransferLineResponseDto {
    const dto = new StockTransferLineResponseDto();
    dto.id = l.id;
    dto.lineNo = l.lineNo;
    dto.itemId = l.itemId;
    dto.variantId = l.variantId;
    dto.uomId = l.uomId;
    dto.qty = Number(l.qty);
    dto.stockMovementId = l.stockMovementId;
    return dto;
  }
}

export class StockTransferResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() companyId!: string;
  @ApiProperty({ example: 'TRF-2026-0001' }) transferNo!: string;
  @ApiProperty({ enum: StockTransferStatus }) status!: StockTransferStatus;
  @ApiProperty() transferDate!: Date;
  @ApiProperty() fromLocationId!: string;
  @ApiProperty() toLocationId!: string;
  @ApiPropertyOptional({ nullable: true }) fromBranchId!: string | null;
  @ApiPropertyOptional({ nullable: true }) toBranchId!: string | null;
  @ApiPropertyOptional({ nullable: true }) notes!: string | null;
  @ApiPropertyOptional({ nullable: true }) approvedById!: string | null;
  @ApiPropertyOptional({ nullable: true }) approvedAt!: Date | null;
  @ApiPropertyOptional({ nullable: true }) postedAt!: Date | null;
  @ApiProperty() createdAt!: Date;
  @ApiPropertyOptional({ type: [StockTransferLineResponseDto] })
  lines?: StockTransferLineResponseDto[];

  static fromEntity(
    this: void,
    t: StockTransferEntity,
  ): StockTransferResponseDto {
    const dto = new StockTransferResponseDto();
    dto.id = t.id;
    dto.companyId = t.companyId;
    dto.transferNo = t.transferNo;
    dto.status = t.status;
    dto.transferDate = t.transferDate;
    dto.fromLocationId = t.fromLocationId;
    dto.toLocationId = t.toLocationId;
    dto.fromBranchId = t.fromBranchId;
    dto.toBranchId = t.toBranchId;
    dto.notes = t.notes;
    dto.approvedById = t.approvedById;
    dto.approvedAt = t.approvedAt;
    dto.postedAt = t.postedAt;
    dto.createdAt = t.createdAt;
    if (t.lines)
      dto.lines = t.lines.map(StockTransferLineResponseDto.fromEntity);
    return dto;
  }
}
