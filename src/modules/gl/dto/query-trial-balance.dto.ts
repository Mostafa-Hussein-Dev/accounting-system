import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import {
  toBoolean,
  toStringArray,
} from '../../../common/dto/query-transformers';

export class QueryTrialBalanceDto {
  @ApiPropertyOptional({
    description:
      'Include entries up to and including this date (default today).',
    example: '2026-07-23',
  })
  @IsOptional()
  @IsDateString()
  asOf?: string;

  @ApiPropertyOptional({
    description: 'Restrict to a single branch.',
    example: 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab',
  })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional({
    description:
      'One or more account-number prefixes (repeat or comma-separate). Restricts the report to those PCL sub-trees, e.g. ?numberPrefix=6,7 for the P&L accounts.',
    example: ['6', '7'],
    type: [String],
  })
  @IsOptional()
  @Transform(toStringArray)
  @IsString({ each: true })
  @MaxLength(20, { each: true })
  numberPrefix?: string[];

  @ApiPropertyOptional({
    description:
      'Roll the report up into one summary line per group instead of per account: per supplied numberPrefix when given, otherwise per PCL class (1–7).',
    example: true,
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  rollUp?: boolean;

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
      'Present all amounts converted into this currency (Tier 2). Needed to read a mixed-base scope as one balancing trial balance; a missing rate falls back to the per-currency breakdown.',
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
