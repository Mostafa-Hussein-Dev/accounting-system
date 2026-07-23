import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Reverse a POSTED entry (FR-901). Creates a new POSTED entry with the same
 * lines and frozen base amounts but swapped sides, so the two net to zero. The
 * reversal’s base amounts are copied from the original (invariant #6) — today’s
 * rate is never re-applied.
 */
export class ReverseJournalEntryDto {
  @ApiPropertyOptional({
    description: 'Date of the reversing entry (defaults to today).',
    example: '2026-07-23',
  })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiPropertyOptional({
    description: 'Reason for the reversal (stored on the new entry).',
    example: 'Posted to the wrong period',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
