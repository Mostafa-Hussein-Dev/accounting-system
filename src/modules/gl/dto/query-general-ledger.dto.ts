import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class QueryGeneralLedgerDto {
  @ApiProperty({ description: 'The account to detail.' })
  @IsUUID()
  accountId!: string;

  @ApiProperty({
    description: 'Start of the period (inclusive).',
    example: '2026-07-01',
  })
  @IsDateString()
  from!: string;

  @ApiProperty({
    description: 'End of the period (inclusive).',
    example: '2026-09-30',
  })
  @IsDateString()
  to!: string;

  @ApiPropertyOptional({ description: 'Restrict to a single branch.' })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional({ description: 'Platform admin: which company.' })
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @ApiPropertyOptional({
    description:
      'Present all amounts converted into this currency; falls back to the per-currency breakdown if a rate is missing.',
    example: 'USD',
  })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  presentIn?: string;

  @ApiPropertyOptional({
    description: 'Rate type for ?presentIn (default Official).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  rateType?: string;
}
