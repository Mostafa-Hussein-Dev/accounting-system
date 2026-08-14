import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
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
  Min,
  ValidateNested,
} from 'class-validator';
import {
  DocumentType,
  PaymentDirection,
  PaymentMethod,
  PaymentStatus,
} from '@prisma/client';

const emptyToUndefined = ({ value }: { value: unknown }): unknown =>
  value === '' ? undefined : value;

export class CreatePaymentAllocationDto {
  @ApiProperty({
    description:
      'The open document to settle — a SALES_INVOICE (receipts) or VENDOR_BILL (payments) belonging to the same partner and in the same currency.',
  })
  @IsUUID()
  documentId!: string;

  @ApiProperty({
    example: 100,
    description:
      'Amount to apply to this document, in the payment currency. Must not exceed the document’s open balance.',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount!: number;
}

export class CreatePaymentDto {
  @ApiProperty({
    enum: PaymentDirection,
    description: 'IN = customer receipt (money in); OUT = supplier payment.',
  })
  @IsEnum(PaymentDirection)
  direction!: PaymentDirection;

  @ApiProperty({ description: 'Customer (IN) or supplier (OUT).' })
  @IsUUID()
  partnerId!: string;

  @ApiProperty({
    description:
      'The cash/bank GL account the money hits (must be a CASH- or BANK-type account).',
  })
  @IsUUID()
  cashAccountId!: string;

  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  branchId?: string;

  @ApiProperty({ example: 'USD' })
  @IsString()
  currencyCode!: string;

  @ApiPropertyOptional({
    example: 89500,
    description:
      'LBP-per-1-USD. Defaults to 1 for the base currency, or the in-force rate on the payment date.',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @IsPositive()
  rate?: number;

  @ApiProperty({
    example: 250,
    description: 'Total amount received/paid, in the payment currency.',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount!: number;

  @ApiProperty({ example: '2026-08-14' })
  @IsString()
  paymentDate!: string;

  @ApiPropertyOptional({
    description: 'Cheque no. / transfer ref / card slip.',
  })
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    type: [CreatePaymentAllocationDto],
    description:
      'Optional: apply the payment to open documents. Anything not allocated stays on the partner’s account.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePaymentAllocationDto)
  allocations?: CreatePaymentAllocationDto[];

  @ApiPropertyOptional({ description: 'Platform admin: which company.' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  companyId?: string;
}

export class QueryPaymentDto {
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

  @ApiPropertyOptional({ enum: PaymentDirection })
  @IsOptional()
  @IsEnum(PaymentDirection)
  direction?: PaymentDirection;

  @ApiPropertyOptional({ enum: PaymentStatus })
  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  partnerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  companyId?: string;
}

export class OpenItemsQueryDto {
  @ApiProperty({ description: 'Partner whose open documents to list.' })
  @IsUUID()
  partnerId!: string;

  @ApiProperty({
    enum: PaymentDirection,
    description:
      'IN lists the customer’s open sales invoices; OUT lists the supplier’s open vendor bills.',
  })
  @IsEnum(PaymentDirection)
  direction!: PaymentDirection;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  companyId?: string;
}

export class PaymentAllocationResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: DocumentType }) documentType!: DocumentType;
  @ApiProperty() documentId!: string;
  @ApiProperty() amountOriginal!: number;
  @ApiProperty() amountBase!: number;
}

export class PaymentResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() companyId!: string;
  @ApiProperty({ example: 'REC-2026-0001' }) paymentNo!: string;
  @ApiProperty({ enum: PaymentDirection }) direction!: PaymentDirection;
  @ApiProperty({ enum: PaymentMethod }) method!: PaymentMethod;
  @ApiProperty({ enum: PaymentStatus }) status!: PaymentStatus;
  @ApiProperty() partnerId!: string;
  @ApiProperty() cashAccountId!: string;
  @ApiPropertyOptional({ nullable: true }) branchId!: string | null;
  @ApiProperty() currencyCode!: string;
  @ApiProperty() rate!: number;
  @ApiProperty() baseCurrencyCode!: string;
  @ApiProperty() amountOriginal!: number;
  @ApiProperty() amountBase!: number;
  @ApiPropertyOptional({ nullable: true }) reference!: string | null;
  @ApiProperty() paymentDate!: Date;
  @ApiPropertyOptional({ nullable: true }) notes!: string | null;
  @ApiPropertyOptional({ nullable: true }) journalEntryId!: string | null;
  @ApiPropertyOptional({ nullable: true }) postedAt!: Date | null;
  @ApiPropertyOptional({ nullable: true }) voidedAt!: Date | null;
  @ApiProperty({ type: [PaymentAllocationResponseDto] })
  allocations!: PaymentAllocationResponseDto[];
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class OpenItemResponseDto {
  @ApiProperty({ enum: DocumentType }) documentType!: DocumentType;
  @ApiProperty() documentId!: string;
  @ApiProperty() number!: string;
  @ApiProperty() date!: Date;
  @ApiProperty() currencyCode!: string;
  @ApiProperty() grandTotal!: number;
  @ApiProperty() allocatedOriginal!: number;
  @ApiProperty() balanceOriginal!: number;
}
