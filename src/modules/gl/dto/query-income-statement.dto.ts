import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { toBoolean } from '../../../common/dto/query-transformers';

export class QueryIncomeStatementDto {
  @ApiProperty({
    description: 'Start of the period (inclusive).',
    example: '2026-01-01',
  })
  @IsDateString()
  from!: string;

  @ApiProperty({
    description: 'End of the period (inclusive).',
    example: '2026-12-31',
  })
  @IsDateString()
  to!: string;

  @ApiPropertyOptional({
    description: 'Roll up into one line per PCL class instead of per account.',
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  rollUp?: boolean;

  @ApiPropertyOptional({ description: 'Restrict to a single branch.' })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional({ description: 'Platform admin: which company.' })
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @ApiPropertyOptional({
    description: 'Present all amounts converted into this currency.',
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
