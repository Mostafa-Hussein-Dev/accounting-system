import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PresentationRateDto } from './account-balance-response.dto';

/** Net VAT position for the period: > 0 owed to the government, < 0 recoverable. */
export type VatDirection = 'PAYABLE' | 'RECOVERABLE' | 'NIL';

export function vatDirection(netVat: number): VatDirection {
  if (netVat > 0) return 'PAYABLE';
  if (netVat < 0) return 'RECOVERABLE';
  return 'NIL';
}

/**
 * A self-contained VAT return in a single base currency. A mixed-base company
 * (base currency changed over the period's life) returns one of these per stored
 * base currency rather than summing across them (docs/PROGRESS.md (base-currency)).
 */
export class VatReturnCurrencyGroupDto {
  @ApiProperty({ example: 'USD' })
  currency!: string;

  @ApiProperty({ description: 'Output VAT collected on sales.', example: 990 })
  outputVat!: number;

  @ApiProperty({ description: 'Input VAT paid on purchases.', example: 610 })
  inputVat!: number;

  @ApiProperty({ description: 'outputVat − inputVat.', example: 380 })
  netVat!: number;

  @ApiProperty({ enum: ['PAYABLE', 'RECOVERABLE', 'NIL'], example: 'PAYABLE' })
  direction!: VatDirection;
}

/** Echoes the ?presentIn conversion: target currency, the rates used, the
 *  converted figures, and whether every source currency could be converted. */
export class VatReturnPresentationDto {
  @ApiProperty({ example: 'USD' })
  currency!: string;

  @ApiProperty({
    description:
      'True when every base currency in scope had a rate and the figures are fully converted; false when a rate was missing.',
    example: true,
  })
  converted!: boolean;

  @ApiProperty({ nullable: true, example: 990 })
  outputVat!: number | null;

  @ApiProperty({ nullable: true, example: 610 })
  inputVat!: number | null;

  @ApiProperty({ nullable: true, example: 380 })
  netVat!: number | null;

  @ApiProperty({
    enum: ['PAYABLE', 'RECOVERABLE', 'NIL'],
    nullable: true,
    example: 'PAYABLE',
  })
  direction!: VatDirection | null;

  @ApiProperty({ type: PresentationRateDto, isArray: true })
  rates!: PresentationRateDto[];
}

/**
 * VAT return (FR-903): output VAT (on sales) − input VAT (on purchases) over a
 * period = net VAT payable/recoverable. Derived from posted journal lines on the
 * VAT_OUT / VAT_IN control accounts within [from, to] — credit notes, reversals
 * and voids net out automatically.
 *
 * Currency handling mirrors the trial balance:
 * - Uniform base currency → `currency` set, scalar `outputVat/inputVat/netVat`.
 * - `?presentIn=XXX` → figures converted into that currency; `presentation`
 *   carries the rates and converted totals (falls back to the breakdown if a
 *   rate is missing).
 * - Mixed base currency with no usable presentIn → scalar figures are null and
 *   `byBaseCurrency` carries one return per currency (never summed across them).
 */
export class VatReturnResponseDto {
  @ApiProperty({ example: '586b91ef-6b89-4e9b-bcaa-99976d65fc4a' })
  companyId!: string;

  @ApiProperty({ example: '2026-07-01' })
  from!: string;

  @ApiProperty({ example: '2026-09-30' })
  to!: string;

  @ApiProperty({
    nullable: true,
    description:
      'Base currency of the scalar figures. Null when the scope spans more than one base currency and no ?presentIn was applied (read byBaseCurrency instead).',
    example: 'USD',
  })
  currency!: string | null;

  @ApiProperty({ nullable: true, example: 990 })
  outputVat!: number | null;

  @ApiProperty({ nullable: true, example: 610 })
  inputVat!: number | null;

  @ApiProperty({ nullable: true, example: 380 })
  netVat!: number | null;

  @ApiProperty({
    enum: ['PAYABLE', 'RECOVERABLE', 'NIL'],
    nullable: true,
    example: 'PAYABLE',
  })
  direction!: VatDirection | null;

  @ApiPropertyOptional({
    type: VatReturnCurrencyGroupDto,
    isArray: true,
    nullable: true,
    description:
      'One VAT return per base currency; present only for a mixed scope viewed without a usable ?presentIn.',
  })
  byBaseCurrency?: VatReturnCurrencyGroupDto[] | null;

  @ApiPropertyOptional({
    type: VatReturnPresentationDto,
    nullable: true,
    description: 'Present only when ?presentIn was requested.',
  })
  presentation?: VatReturnPresentationDto | null;
}
