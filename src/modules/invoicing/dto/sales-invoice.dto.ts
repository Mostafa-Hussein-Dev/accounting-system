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
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { SalesInvoiceStatus, TaxTreatment } from '@prisma/client';

const emptyToUndefined = ({ value }: { value: unknown }): unknown =>
  value === '' ? undefined : value;

export class CreateSalesInvoiceLineDto {
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

  @ApiProperty({ example: 3 })
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  qty!: number;

  @ApiPropertyOptional({
    example: 25,
    description:
      "Unit sale price; defaults to the item's sale price if omitted.",
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  unitPrice?: number;

  @ApiPropertyOptional({ example: 10, description: 'Line discount %, 0–100.' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  lineDiscountPct?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  taxRateId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

export class CreateSalesInvoiceDto {
  @ApiProperty()
  @IsUUID()
  customerId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional({
    description:
      'Internal location the goods ship from (required when any line is stock-tracked).',
  })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  locationId?: string;

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
  invoiceDate!: string;

  @ApiPropertyOptional({ example: '2026-09-06' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  dueDate?: string;

  @ApiPropertyOptional({ description: "The customer's own reference." })
  @IsOptional()
  @IsString()
  customerRef?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ type: [CreateSalesInvoiceLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSalesInvoiceLineDto)
  lines!: CreateSalesInvoiceLineDto[];

  @ApiPropertyOptional({ description: 'Platform admin: which company.' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  companyId?: string;
}

export class QuerySalesInvoiceDto {
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

  @ApiPropertyOptional({ enum: SalesInvoiceStatus })
  @IsOptional()
  status?: SalesInvoiceStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  companyId?: string;
}

export class SalesInvoiceLineResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() lineNo!: number;
  @ApiProperty() itemId!: string;
  @ApiPropertyOptional({ nullable: true }) variantId!: string | null;
  @ApiProperty() uomId!: string;
  @ApiProperty() qty!: number;
  @ApiProperty() unitPrice!: number;
  @ApiProperty() lineDiscountPct!: number;
  @ApiPropertyOptional({ nullable: true }) taxRateId!: string | null;
  @ApiProperty({ enum: TaxTreatment }) vatTreatment!: TaxTreatment;
  @ApiProperty() ratePct!: number;
  @ApiProperty() netAmount!: number;
  @ApiProperty() vatAmount!: number;
  @ApiProperty() totalAmount!: number;
  @ApiProperty() costBase!: number;
  @ApiPropertyOptional({ nullable: true }) stockMovementId!: string | null;
  @ApiPropertyOptional({ nullable: true }) description!: string | null;
}

export class SalesInvoiceResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() companyId!: string;
  @ApiProperty({ example: 'SINV-2026-0001' }) invoiceNo!: string;
  @ApiProperty({ enum: SalesInvoiceStatus }) status!: SalesInvoiceStatus;
  @ApiProperty() customerId!: string;
  @ApiPropertyOptional({ nullable: true }) branchId!: string | null;
  @ApiPropertyOptional({ nullable: true }) locationId!: string | null;
  @ApiProperty() currencyCode!: string;
  @ApiProperty() rate!: number;
  @ApiProperty() invoiceDate!: Date;
  @ApiPropertyOptional({ nullable: true }) dueDate!: Date | null;
  @ApiPropertyOptional({ nullable: true }) customerRef!: string | null;
  @ApiPropertyOptional({ nullable: true }) notes!: string | null;
  @ApiProperty() subtotal!: number;
  @ApiProperty() vatTotal!: number;
  @ApiProperty() grandTotal!: number;
  @ApiProperty() subtotalBase!: number;
  @ApiProperty() vatTotalBase!: number;
  @ApiProperty() grandTotalBase!: number;
  @ApiProperty() cogsTotalBase!: number;
  @ApiPropertyOptional({ nullable: true }) journalEntryId!: string | null;
  @ApiPropertyOptional({ nullable: true }) postedAt!: Date | null;
  @ApiProperty({ type: [SalesInvoiceLineResponseDto] })
  lines!: SalesInvoiceLineResponseDto[];
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
