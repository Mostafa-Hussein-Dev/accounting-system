import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { JournalLineDto } from './journal-line.dto';

/**
 * Edit a DRAFT entry only (a posted entry is immutable — invariant #2). When
 * `lines` is supplied it REPLACES the entry’s lines wholesale (they are
 * re-validated and re-balanced); omit it to touch only the header fields.
 */
export class UpdateJournalEntryDto {
  @ApiPropertyOptional({ example: '2026-07-23' })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiPropertyOptional({ example: 'ADJ-2026-07' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;

  @ApiPropertyOptional({ example: 'Month-end depreciation' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    description: 'Set to move the entry to a branch, or null to clear it.',
    example: 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab',
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  branchId?: string | null;

  @ApiPropertyOptional({
    description: 'Replacement lines (at least two, must balance).',
    type: JournalLineDto,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => JournalLineDto)
  lines?: JournalLineDto[];
}
