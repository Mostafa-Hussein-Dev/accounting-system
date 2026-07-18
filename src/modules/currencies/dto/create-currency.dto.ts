import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateCurrencyDto {
  @ApiProperty({
    description:
      'ISO 4217 currency code — three uppercase letters. Immutable identity of the currency.',
    example: 'LBP',
  })
  @IsString()
  @Matches(/^[A-Z]{3}$/, {
    message: 'code must be a 3-letter uppercase ISO 4217 code (e.g. USD, LBP)',
  })
  code!: string;

  @ApiProperty({
    description: 'Display name (fallback used when no localized name is set)',
    example: 'Lebanese Pound',
  })
  @IsString()
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ description: 'Arabic name', example: 'ليرة لبنانية' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  nameAr?: string;

  @ApiPropertyOptional({
    description: 'French name',
    example: 'Livre libanaise',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  nameFr?: string;

  @ApiPropertyOptional({
    description: 'English name',
    example: 'Lebanese Pound',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  nameEn?: string;

  @ApiProperty({ description: 'Currency symbol', example: 'ل.ل' })
  @IsString()
  @MaxLength(10)
  symbol!: string;

  @ApiProperty({
    description:
      'Number of decimal places amounts in this currency carry (USD = 2, LBP = 0).',
    example: 0,
  })
  @IsInt()
  @Min(0)
  @Max(8)
  decimalPlaces!: number;

  @ApiPropertyOptional({
    description: 'Whether the currency is available for new transactions.',
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
