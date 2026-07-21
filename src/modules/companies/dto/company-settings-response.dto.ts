import { ApiProperty } from '@nestjs/swagger';
import { RoundingSettingDto } from './update-company-settings.dto';

// The full resolved per-company configuration (FR-108): the typed company
// columns (baseCurrencyCode, fiscalYearStartMonth) plus the `settings` JSON
// bucket, with sensible defaults filled in for any key not yet set.
export class CompanySettingsResponseDto {
  @ApiProperty({ example: 'USD' })
  baseCurrencyCode!: string;

  @ApiProperty({ example: 1 })
  fiscalYearStartMonth!: number;

  @ApiProperty({
    type: RoundingSettingDto,
    example: { decimals: 2, mode: 'HALF_UP' },
  })
  rounding!: RoundingSettingDto;

  @ApiProperty({ example: { invoice: 'a4-standard' } })
  defaultTemplates!: Record<string, string>;

  @ApiProperty({ example: ['invoicing', 'purchasing'], type: [String] })
  enabledModules!: string[];

  @ApiProperty({ example: { creditNotes: true } })
  featureFlags!: Record<string, boolean>;

  @ApiProperty({ example: { 'item.cost': false } })
  fieldVisibility!: Record<string, boolean>;
}
