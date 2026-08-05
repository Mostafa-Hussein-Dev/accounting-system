import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
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
import { PurchaseOrderStatus, TaxTreatment } from '@prisma/client';

const emptyToUndefined = ({ value }: { value: unknown }): unknown =>
  value === '' ? undefined : value;

export class CreatePurchaseOrderLineDto {
  @ApiProperty()
  @IsUUID()
  itemId!: string;

  @ApiPropertyOptional({ description: 'Required if the item has variants.' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  variantId?: string;

  @ApiPropertyOptional({
    description: 'Purchase UoM; defaults to the item purchase/base UoM.',
  })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  uomId?: string;

  @ApiProperty({ example: 100 })
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  qtyOrdered!: number;

  @ApiPropertyOptional({
    description:
      "Unit cost in the order currency. Defaults to the item's cost price when omitted; provide it to record a supplier-specific / negotiated price.",
    example: 4.5,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  unitCost?: number;

  @ApiPropertyOptional({
    description: 'Override the VAT rate; defaults to the item VAT rate.',
  })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  taxRateId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

export class CreatePurchaseOrderDto {
  @ApiProperty()
  @IsUUID()
  supplierId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  branchId?: string;

  @ApiProperty({ example: 'USD' })
  @IsString()
  currencyCode!: string;

  @ApiPropertyOptional({
    description:
      'Currency units per 1 USD; resolved from exchange rates if omitted.',
    example: 89500,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @IsPositive()
  rate?: number;

  @ApiProperty({ example: '2026-08-01' })
  @IsString()
  orderDate!: string;

  @ApiPropertyOptional({ example: '2026-08-15' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  expectedDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ type: [CreatePurchaseOrderLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseOrderLineDto)
  lines!: CreatePurchaseOrderLineDto[];

  @ApiPropertyOptional({ description: 'Platform admin: which company.' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  companyId?: string;
}

export class UpdatePurchaseOrderDto extends PartialType(
  CreatePurchaseOrderDto,
) {}

export class QueryPurchaseOrderDto {
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

  @ApiPropertyOptional({ enum: PurchaseOrderStatus })
  @IsOptional()
  status?: PurchaseOrderStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  supplierId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  companyId?: string;
}

export class PurchaseOrderLineResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() lineNo!: number;
  @ApiProperty() itemId!: string;
  @ApiPropertyOptional({ nullable: true }) variantId!: string | null;
  @ApiProperty() uomId!: string;
  @ApiProperty() qtyOrdered!: number;
  @ApiProperty() qtyReceived!: number;
  @ApiProperty() unitCost!: number;
  @ApiPropertyOptional({ nullable: true }) taxRateId!: string | null;
  @ApiProperty({ enum: TaxTreatment }) vatTreatment!: TaxTreatment;
  @ApiProperty() ratePct!: number;
  @ApiProperty() netAmount!: number;
  @ApiProperty() vatAmount!: number;
  @ApiProperty() totalAmount!: number;
  @ApiPropertyOptional({ nullable: true }) description!: string | null;
}

export class PurchaseOrderResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() companyId!: string;
  @ApiProperty({ example: 'PO-2026-0001' }) orderNo!: string;
  @ApiProperty({ enum: PurchaseOrderStatus }) status!: PurchaseOrderStatus;
  @ApiProperty() supplierId!: string;
  @ApiPropertyOptional({ nullable: true }) branchId!: string | null;
  @ApiProperty() currencyCode!: string;
  @ApiProperty() rate!: number;
  @ApiProperty() orderDate!: Date;
  @ApiPropertyOptional({ nullable: true }) expectedDate!: Date | null;
  @ApiPropertyOptional({ nullable: true }) notes!: string | null;
  @ApiProperty() subtotal!: number;
  @ApiProperty() vatTotal!: number;
  @ApiProperty() grandTotal!: number;
  @ApiProperty() subtotalBase!: number;
  @ApiProperty() vatTotalBase!: number;
  @ApiProperty() grandTotalBase!: number;
  @ApiProperty({ type: [PurchaseOrderLineResponseDto] })
  lines!: PurchaseOrderLineResponseDto[];
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
