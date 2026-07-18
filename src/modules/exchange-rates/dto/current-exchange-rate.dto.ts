import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

// Query for "the rate in force on a date" — the newest rate whose effectiveDate
// is on or before `date`, for a given currency + rate type.
export class CurrentExchangeRateDto {
  @ApiProperty({
    description: 'Currency to look up (ISO 4217 code)',
    example: 'LBP',
  })
  @IsString()
  @Matches(/^[A-Z]{3}$/, {
    message: 'currencyCode must be a 3-letter uppercase ISO 4217 code',
  })
  currencyCode!: string;

  @ApiProperty({ description: 'Rate type to look up', example: 'Official' })
  @IsString()
  @MaxLength(50)
  rateType!: string;

  @ApiPropertyOptional({
    description:
      'The document date to price. Defaults to today if omitted. Returns the rate in force on this date.',
    example: '2026-07-18',
  })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiPropertyOptional({
    description:
      'Platform admin only: which company to look up. Ignored for company-scoped callers.',
    example: 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab',
  })
  @IsOptional()
  @IsUUID()
  companyId?: string;
}
