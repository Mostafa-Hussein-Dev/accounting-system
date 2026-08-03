import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export const ROUNDING_MODES = [
  'HALF_UP',
  'HALF_DOWN',
  'HALF_EVEN',
  'UP',
  'DOWN',
] as const;

export class RoundingSettingDto {
  @ApiPropertyOptional({
    description: 'Decimal places to round to',
    example: 2,
  })
  @IsInt()
  @Min(0)
  @Max(6)
  decimals!: number;

  @ApiPropertyOptional({ enum: ROUNDING_MODES, example: 'HALF_UP' })
  @IsIn(ROUNDING_MODES)
  mode!: (typeof ROUNDING_MODES)[number];
}

// All fields optional. Most are merged into the company's `settings` JSON
// (FR-108): featureFlags / fieldVisibility / defaultTemplates are deep-merged
// so a single flag can be toggled; rounding / enabledModules are replaced
// wholesale.
//
// baseCurrencyCode and fiscalYearStartMonth are the exception — they are real
// Company columns, not settings-JSON keys, and updateSettings() writes them
// there. They belong on this DTO because the settings *response* has always
// returned them: without them the endpoint advertised fields it silently
// refused to accept. Since the app runs `whitelist: true` (main.ts), they were
// stripped from the body, so a PATCH succeeded, changed nothing, and echoed the
// old values straight back.
export class UpdateCompanySettingsDto {
  @ApiPropertyOptional({
    description:
      'Currency the books are kept in (Currency.code). Stored on the Company row, not in the settings JSON.',
    example: 'USD',
  })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  baseCurrencyCode?: string;

  @ApiPropertyOptional({
    description:
      'Month the fiscal year starts, 1–12. Stored on the Company row, not in the settings JSON.',
    example: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  fiscalYearStartMonth?: number;

  @ApiPropertyOptional({ type: RoundingSettingDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => RoundingSettingDto)
  rounding?: RoundingSettingDto;

  @ApiPropertyOptional({
    description: 'Default document templates by type',
    example: { invoice: 'a4-standard', receipt: 'thermal-80mm' },
  })
  @IsOptional()
  @IsObject()
  defaultTemplates?: Record<string, string>;

  @ApiPropertyOptional({
    description: 'Modules enabled for this company',
    example: ['invoicing', 'purchasing', 'pos'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  enabledModules?: string[];

  @ApiPropertyOptional({
    description: 'Feature flags (show/hide features per company)',
    example: { creditNotes: true, whatsappSend: false },
  })
  @IsOptional()
  @IsObject()
  featureFlags?: Record<string, boolean>;

  @ApiPropertyOptional({
    description: 'Per-company field visibility toggles',
    example: { 'invoice.salesman': true, 'item.cost': false },
  })
  @IsOptional()
  @IsObject()
  fieldVisibility?: Record<string, boolean>;
}
