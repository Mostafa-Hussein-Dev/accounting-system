import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

export class CreateJournalEntryDto {
  @ApiProperty({
    description: 'Accounting date of the entry (ISO 8601 date).',
    example: '2026-07-23',
  })
  @IsDateString()
  date!: string;

  @ApiPropertyOptional({
    description: 'External reference (cheque no., document ref, …).',
    example: 'ADJ-2026-07',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;

  @ApiPropertyOptional({
    description: 'Narrative for the whole entry.',
    example: 'Month-end depreciation',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    description:
      'Branch this entry belongs to (drives the numbering series). Omit for a company-wide entry.',
    example: 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab',
  })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiProperty({
    description:
      'The entry’s lines — at least two, and their base-currency debits must equal credits.',
    type: JournalLineDto,
    isArray: true,
  })
  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => JournalLineDto)
  lines!: JournalLineDto[];

  @ApiPropertyOptional({
    description:
      'Company this entry belongs to. A company-scoped caller is forced into their own company — this is ignored. A platform admin must target a company via this field.',
    example: 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab',
  })
  @IsOptional()
  @IsUUID()
  companyId?: string;
}
