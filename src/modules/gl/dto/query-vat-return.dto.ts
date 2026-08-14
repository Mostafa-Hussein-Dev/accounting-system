import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class QueryVatReturnDto {
  @ApiProperty({
    description: 'Start of the VAT period (inclusive).',
    example: '2026-07-01',
  })
  @IsDateString()
  from!: string;

  @ApiProperty({
    description: 'End of the VAT period (inclusive).',
    example: '2026-09-30',
  })
  @IsDateString()
  to!: string;

  @ApiPropertyOptional({
    description:
      'Restrict to a single branch (VAT is normally filed company-wide).',
    example: 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab',
  })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional({
    description:
      'Platform admin: which company to report on. Ignored for a company-scoped caller.',
    example: 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab',
  })
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @ApiPropertyOptional({
    description:
      'Present all figures converted into this currency (Tier 2). Needed to read a mixed-base scope as one return; a missing rate falls back to the per-currency breakdown.',
    example: 'USD',
  })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  presentIn?: string;

  @ApiPropertyOptional({
    description: 'Rate type for ?presentIn conversion (default Official).',
    example: 'Official',
  })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  rateType?: string;
}
