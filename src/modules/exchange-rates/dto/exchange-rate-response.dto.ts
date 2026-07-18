import { ApiProperty } from '@nestjs/swagger';
import { ExchangeRate } from '@prisma/client';

export class ExchangeRateResponseDto {
  @ApiProperty({ example: 'f4a1c2e0-1234-4a5b-9c8d-1234567890ab' })
  id!: string;

  @ApiProperty({ example: '586b91ef-6b89-4e9b-bcaa-99976d65fc4a' })
  companyId!: string;

  @ApiProperty({ description: 'Currency valued against USD', example: 'LBP' })
  currencyCode!: string;

  @ApiProperty({ example: 'Official' })
  rateType!: string;

  @ApiProperty({
    description: 'Date the rate takes effect (date-only)',
    example: '2026-07-18',
  })
  effectiveDate!: string;

  @ApiProperty({
    description: 'Units of currencyCode per 1 USD (LBP-per-1-USD convention)',
    example: 89500,
  })
  rate!: number;

  @ApiProperty({ example: '2026-07-18T14:30:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-07-18T14:30:00.000Z' })
  updatedAt!: Date;

  static fromEntity(this: void, rate: ExchangeRate): ExchangeRateResponseDto {
    const dto = new ExchangeRateResponseDto();
    dto.id = rate.id;
    dto.companyId = rate.companyId;
    dto.currencyCode = rate.currencyCode;
    dto.rateType = rate.rateType;
    // @db.Date column — expose the date-only portion (YYYY-MM-DD), consistent
    // with docs/API-DESIGN.md "Date-only fields".
    dto.effectiveDate = rate.effectiveDate.toISOString().slice(0, 10);
    // Prisma Decimal -> number for the JSON envelope. Rates fit comfortably in
    // a JS number at the 6-dp precision this column stores.
    dto.rate = Number(rate.rate);
    dto.createdAt = rate.createdAt;
    dto.updatedAt = rate.updatedAt;
    return dto;
  }
}
