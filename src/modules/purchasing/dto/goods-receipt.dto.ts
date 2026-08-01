import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { GoodsReceiptStatus } from '@prisma/client';

const emptyToUndefined = ({ value }: { value: unknown }): unknown =>
  value === '' ? undefined : value;

export class ReceiveLineDto {
  @ApiProperty({ description: 'The purchase-order line being received.' })
  @IsUUID()
  purchaseOrderLineId!: string;

  @ApiProperty({
    description: 'Quantity received (in the PO line UoM).',
    example: 40,
  })
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  qtyReceived!: number;
}

export class CreateGoodsReceiptDto {
  @ApiProperty()
  @IsUUID()
  purchaseOrderId!: string;

  @ApiProperty({ description: 'Destination INTERNAL location.' })
  @IsUUID()
  locationId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  branchId?: string;

  @ApiProperty({ example: '2026-08-05' })
  @IsString()
  receiptDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ type: [ReceiveLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReceiveLineDto)
  lines!: ReceiveLineDto[];

  @ApiPropertyOptional({ description: 'Platform admin: which company.' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  companyId?: string;
}

export class QueryGoodsReceiptDto {
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
  purchaseOrderId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  companyId?: string;
}

export class GoodsReceiptLineResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() purchaseOrderLineId!: string;
  @ApiProperty() itemId!: string;
  @ApiPropertyOptional({ nullable: true }) variantId!: string | null;
  @ApiProperty() uomId!: string;
  @ApiProperty() qtyReceived!: number;
  @ApiProperty({ description: 'Unit cost in base currency (frozen).' })
  unitCostBase!: number;
  @ApiPropertyOptional({ nullable: true }) stockMovementId!: string | null;
}

export class GoodsReceiptResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() companyId!: string;
  @ApiProperty({ example: 'GRN-2026-0001' }) receiptNo!: string;
  @ApiProperty({ enum: GoodsReceiptStatus }) status!: GoodsReceiptStatus;
  @ApiProperty() purchaseOrderId!: string;
  @ApiProperty() locationId!: string;
  @ApiPropertyOptional({ nullable: true }) branchId!: string | null;
  @ApiProperty() receiptDate!: Date;
  @ApiPropertyOptional({ nullable: true }) notes!: string | null;
  @ApiProperty({ type: [GoodsReceiptLineResponseDto] })
  lines!: GoodsReceiptLineResponseDto[];
  @ApiProperty() createdAt!: Date;
}
