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
import { TaxTreatment, VendorBillStatus } from '@prisma/client';

const emptyToUndefined = ({ value }: { value: unknown }): unknown =>
  value === '' ? undefined : value;

export class CreateVendorBillLineDto {
  @ApiProperty()
  @IsUUID()
  itemId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  variantId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  uomId?: string;

  @ApiProperty({ example: 100 })
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  qty!: number;

  @ApiProperty({ example: 4.5 })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  unitCost!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  taxRateId?: string;

  @ApiPropertyOptional({ description: 'Link back to the PO line, if any.' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  purchaseOrderLineId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

export class CreateVendorBillDto {
  @ApiProperty()
  @IsUUID()
  supplierId!: string;

  @ApiPropertyOptional({ description: 'Link back to a purchase order.' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  purchaseOrderId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  branchId?: string;

  @ApiProperty({ example: 'USD' })
  @IsString()
  currencyCode!: string;

  @ApiPropertyOptional({ example: 89500 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @IsPositive()
  rate?: number;

  @ApiProperty({ example: '2026-08-06' })
  @IsString()
  billDate!: string;

  @ApiPropertyOptional({ example: '2026-09-06' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  dueDate?: string;

  @ApiPropertyOptional({ description: "The supplier's own invoice number." })
  @IsOptional()
  @IsString()
  supplierRef?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ type: [CreateVendorBillLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateVendorBillLineDto)
  lines!: CreateVendorBillLineDto[];

  @ApiPropertyOptional({ description: 'Platform admin: which company.' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  companyId?: string;
}

export class UpdateVendorBillDto extends PartialType(CreateVendorBillDto) {}

export class QueryVendorBillDto {
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

  @ApiPropertyOptional({ enum: VendorBillStatus })
  @IsOptional()
  status?: VendorBillStatus;

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

export class VendorBillLineResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() lineNo!: number;
  @ApiProperty() itemId!: string;
  @ApiPropertyOptional({ nullable: true }) variantId!: string | null;
  @ApiProperty() uomId!: string;
  @ApiProperty() qty!: number;
  @ApiProperty() unitCost!: number;
  @ApiPropertyOptional({ nullable: true }) taxRateId!: string | null;
  @ApiProperty({ enum: TaxTreatment }) vatTreatment!: TaxTreatment;
  @ApiProperty() ratePct!: number;
  @ApiProperty() netAmount!: number;
  @ApiProperty() vatAmount!: number;
  @ApiProperty() totalAmount!: number;
  @ApiPropertyOptional({ nullable: true }) description!: string | null;
}

export class VendorBillResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() companyId!: string;
  @ApiProperty({ example: 'BILL-2026-0001' }) billNo!: string;
  @ApiProperty({ enum: VendorBillStatus }) status!: VendorBillStatus;
  @ApiProperty() supplierId!: string;
  @ApiPropertyOptional({ nullable: true }) purchaseOrderId!: string | null;
  @ApiPropertyOptional({ nullable: true }) branchId!: string | null;
  @ApiProperty() currencyCode!: string;
  @ApiProperty() rate!: number;
  @ApiProperty() billDate!: Date;
  @ApiPropertyOptional({ nullable: true }) dueDate!: Date | null;
  @ApiPropertyOptional({ nullable: true }) supplierRef!: string | null;
  @ApiPropertyOptional({ nullable: true }) notes!: string | null;
  @ApiProperty() subtotal!: number;
  @ApiProperty() vatTotal!: number;
  @ApiProperty() grandTotal!: number;
  @ApiProperty() subtotalBase!: number;
  @ApiProperty() vatTotalBase!: number;
  @ApiProperty() grandTotalBase!: number;
  @ApiPropertyOptional({ nullable: true }) journalEntryId!: string | null;
  @ApiPropertyOptional({ nullable: true }) postedAt!: Date | null;
  @ApiProperty({ type: [VendorBillLineResponseDto] })
  lines!: VendorBillLineResponseDto[];
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
