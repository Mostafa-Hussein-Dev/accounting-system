import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateExchangeRateDto {
  @ApiProperty({
    description: 'ISO 4217 code of the currency this rate values against USD.',
    example: 'LBP',
  })
  @IsString()
  @Matches(/^[A-Z]{3}$/, {
    message: 'currencyCode must be a 3-letter uppercase ISO 4217 code',
  })
  currencyCode!: string;

  @ApiProperty({
    description:
      'Named rate type — e.g. "Official", "Market", or "Custom" (legacy SARFE/FOBRATE/BALBYRATE). Free-form so tenants can name their own.',
    example: 'Official',
  })
  @IsString()
  @MaxLength(50)
  rateType!: string;

  @ApiProperty({
    description: 'Date the rate takes effect (date-only, treated as UTC).',
    example: '2026-07-18',
  })
  @IsDateString()
  effectiveDate!: string;

  @ApiProperty({
    description:
      'Rate expressed as how many of currencyCode equal 1 USD (LBP-per-1-USD convention — never inverted). E.g. 89500 means 1 USD = 89,500 LBP.',
    example: 89500,
  })
  @IsNumber({ maxDecimalPlaces: 6 })
  @IsPositive()
  rate!: number;

  @ApiPropertyOptional({
    description:
      'Company this rate belongs to. A company-scoped caller is always forced into their own company — this field is ignored/overridden. A platform admin must target a company via this field.',
    example: 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab',
  })
  @IsOptional()
  @IsUUID()
  companyId?: string;
}
