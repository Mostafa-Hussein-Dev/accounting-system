import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateCompanyDto {
  @ApiProperty({
    description: 'Company legal name',
    example: 'Beirut Trading Co.',
  })
  @IsString()
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional({
    description: 'Tax registration number',
    example: 'LB-123456',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  taxNumber?: string;

  @ApiPropertyOptional({
    description: 'Contact phone number',
    example: '+961 1 234 567',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @ApiPropertyOptional({
    description: 'Contact email',
    example: 'info@beiruttrading.com',
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    description: 'URL to the company logo image',
    example: 'https://cdn.example.com/logo.png',
  })
  @IsOptional()
  @IsUrl()
  logo?: string;

  @ApiPropertyOptional({
    description:
      'Currency the books are kept in (Currency.code). Defaults to USD (FR-108).',
    example: 'USD',
    default: 'USD',
  })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  baseCurrencyCode?: string;

  @ApiPropertyOptional({
    description: 'Month the fiscal year starts, 1–12 (Lebanon = January).',
    example: 1,
    default: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  fiscalYearStartMonth?: number;
}
