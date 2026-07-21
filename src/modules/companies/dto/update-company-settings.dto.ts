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

// All fields optional — a PATCH merges the provided keys into the company's
// `settings` JSON (FR-108). featureFlags / fieldVisibility / defaultTemplates
// are deep-merged so a single flag can be toggled; rounding / enabledModules
// are replaced wholesale.
export class UpdateCompanySettingsDto {
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
