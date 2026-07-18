import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Currency } from '@prisma/client';

export class CurrencyResponseDto {
  @ApiProperty({ description: 'ISO 4217 code (primary key)', example: 'LBP' })
  code!: string;

  @ApiProperty({ example: 'Lebanese Pound' })
  name!: string;

  @ApiPropertyOptional({ example: 'ليرة لبنانية', nullable: true })
  nameAr!: string | null;

  @ApiPropertyOptional({ example: 'Livre libanaise', nullable: true })
  nameFr!: string | null;

  @ApiPropertyOptional({ example: 'Lebanese Pound', nullable: true })
  nameEn!: string | null;

  @ApiProperty({ example: 'ل.ل' })
  symbol!: string;

  @ApiProperty({ description: 'Decimal places (USD = 2, LBP = 0)', example: 0 })
  decimalPlaces!: number;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({ example: '2025-06-03T14:30:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2025-06-03T14:30:00.000Z' })
  updatedAt!: Date;

  static fromEntity(this: void, currency: Currency): CurrencyResponseDto {
    const dto = new CurrencyResponseDto();
    dto.code = currency.code;
    dto.name = currency.name;
    dto.nameAr = currency.nameAr;
    dto.nameFr = currency.nameFr;
    dto.nameEn = currency.nameEn;
    dto.symbol = currency.symbol;
    dto.decimalPlaces = currency.decimalPlaces;
    dto.isActive = currency.isActive;
    dto.createdAt = currency.createdAt;
    dto.updatedAt = currency.updatedAt;
    return dto;
  }
}
