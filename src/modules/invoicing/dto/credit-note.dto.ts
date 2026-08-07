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
import { CreditNoteStatus, TaxTreatment } from '@prisma/client';

const emptyToUndefined = ({ value }: { value: unknown }): unknown =>
  value === '' ? undefined : value;

export class CreateCreditNoteLineDto {
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

  @ApiProperty({ example: 1 })
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  qty!: number;

  @ApiPropertyOptional({
    example: 25,
    description: "Unit price; defaults to the item's sale price if omitted.",
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

export class CreateCreditNoteDto {
  @ApiProperty()
  @IsUUID()
  customerId!: string;

  @ApiPropertyOptional({
    description: 'The sales invoice being credited, if any.',
  })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  salesInvoiceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional({
    description:
      'Internal location returned stock is restocked into (required when any line is stock-tracked).',
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
  creditNoteDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ type: [CreateCreditNoteLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateCreditNoteLineDto)
  lines!: CreateCreditNoteLineDto[];

  @ApiPropertyOptional({ description: 'Platform admin: which company.' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  companyId?: string;
}

export class QueryCreditNoteDto {
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

  @ApiPropertyOptional({ enum: CreditNoteStatus })
  @IsOptional()
  status?: CreditNoteStatus;

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

export class CreditNoteLineResponseDto {
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

export class CreditNoteResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() companyId!: string;
  @ApiProperty({ example: 'SCRN-2026-0001' }) creditNoteNo!: string;
  @ApiProperty({ enum: CreditNoteStatus }) status!: CreditNoteStatus;
  @ApiProperty() customerId!: string;
  @ApiPropertyOptional({ nullable: true }) salesInvoiceId!: string | null;
  @ApiPropertyOptional({ nullable: true }) branchId!: string | null;
  @ApiPropertyOptional({ nullable: true }) locationId!: string | null;
  @ApiProperty() currencyCode!: string;
  @ApiProperty() rate!: number;
  @ApiProperty() creditNoteDate!: Date;
  @ApiPropertyOptional({ nullable: true }) reason!: string | null;
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
  @ApiProperty({ type: [CreditNoteLineResponseDto] })
  lines!: CreditNoteLineResponseDto[];
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
