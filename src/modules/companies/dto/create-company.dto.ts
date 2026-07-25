import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
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

  @ApiPropertyOptional({
    description:
      'Platform admin only: attach the new company to this user (they become a member + Company Admin). Ignored for a company user, who always becomes the owner of the company they create. Not accepted at /auth/register.',
    example: 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab',
  })
  // Treat an empty string (e.g. an unset Postman variable, or a company user
  // who doesn't supply one) as "not provided" so it doesn't fail UUID validation.
  @Transform(({ value }: { value: unknown }) =>
    value === '' ? undefined : value,
  )
  @IsOptional()
  @IsUUID()
  ownerUserId?: string;
}
