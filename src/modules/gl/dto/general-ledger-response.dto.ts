import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PresentationRateDto } from './account-balance-response.dto';

export class GeneralLedgerRowDto {
  @ApiProperty({ example: '2026-08-15' })
  date!: string;

  @ApiProperty({ nullable: true, example: 'JE-2026-0003' })
  entryNumber!: string | null;

  @ApiProperty({ nullable: true, example: 'Sales invoice INV-2026-0001' })
  description!: string | null;

  @ApiProperty({ example: 99.9 })
  debit!: number;

  @ApiProperty({ example: 0 })
  credit!: number;

  @ApiProperty({
    description:
      'Signed running balance after this line (debit − credit, cumulative from the opening balance).',
    example: 99.9,
  })
  runningBalance!: number;

  @ApiProperty({ nullable: true })
  partnerId!: string | null;
}

/** One account's ledger within a single base currency. */
export class GeneralLedgerCurrencyGroupDto {
  @ApiProperty({ example: 'USD' })
  currency!: string;

  @ApiProperty({ description: 'Signed balance before `from`.', example: 0 })
  openingBalance!: number;

  @ApiProperty({ type: GeneralLedgerRowDto, isArray: true })
  rows!: GeneralLedgerRowDto[];

  @ApiProperty({ example: 99.9 })
  totalDebit!: number;

  @ApiProperty({ example: 0 })
  totalCredit!: number;

  @ApiProperty({
    description: 'openingBalance + Σ(debit − credit).',
    example: 99.9,
  })
  closingBalance!: number;
}

export class GeneralLedgerPresentationDto {
  @ApiProperty({ example: 'USD' })
  currency!: string;

  @ApiProperty({ example: true })
  converted!: boolean;

  @ApiProperty({ type: PresentationRateDto, isArray: true })
  rates!: PresentationRateDto[];
}

/**
 * General ledger (FR-905): one account's posted lines over a period with a
 * running balance. Currency handling mirrors the trial balance — uniform base →
 * flat rows; `?presentIn` → converted single series; mixed base → one section per
 * base currency (a running balance only makes sense within one currency).
 */
export class GeneralLedgerResponseDto {
  @ApiProperty() companyId!: string;
  @ApiProperty() accountId!: string;
  @ApiProperty() accountNumber!: string;
  @ApiProperty() accountName!: string;
  @ApiProperty({ example: '2026-07-01' }) from!: string;
  @ApiProperty({ example: '2026-09-30' }) to!: string;

  @ApiProperty({
    nullable: true,
    description: 'Null for a mixed-base account with no presentIn.',
  })
  currency!: string | null;

  @ApiProperty({ nullable: true }) openingBalance!: number | null;

  @ApiProperty({ type: GeneralLedgerRowDto, isArray: true })
  rows!: GeneralLedgerRowDto[];

  @ApiProperty({ nullable: true }) totalDebit!: number | null;
  @ApiProperty({ nullable: true }) totalCredit!: number | null;
  @ApiProperty({ nullable: true }) closingBalance!: number | null;

  @ApiPropertyOptional({
    type: GeneralLedgerCurrencyGroupDto,
    isArray: true,
    nullable: true,
    description:
      'One ledger per base currency; only for a mixed-base account without presentIn.',
  })
  byBaseCurrency?: GeneralLedgerCurrencyGroupDto[] | null;

  @ApiPropertyOptional({ type: GeneralLedgerPresentationDto, nullable: true })
  presentation?: GeneralLedgerPresentationDto | null;
}
