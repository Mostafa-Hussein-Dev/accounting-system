import { ApiPropertyOptional } from '@nestjs/swagger';
import { AccountType } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import {
  toBoolean,
  toNumberArray,
  toStringArray,
} from '../../../common/dto/query-transformers';

// Filters for the flat account list. All optional — combined with AND.
export class QueryAccountDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description:
      'Filter by one or more PCL classes (1–7). Repeat the param or comma-separate, e.g. ?accountClass=6,7.',
    example: [6, 7],
    type: [Number],
  })
  @IsOptional()
  @Transform(toNumberArray)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  accountClass?: number[];

  @ApiPropertyOptional({
    enum: AccountType,
    description: 'Filter by account type',
  })
  @IsOptional()
  @IsEnum(AccountType)
  type?: AccountType;

  @ApiPropertyOptional({
    description: 'Filter to only control accounts',
    example: true,
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isControl?: boolean;

  @ApiPropertyOptional({ description: 'Filter by active flag', example: true })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Filter to direct children of this parent account id',
    example: 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab',
  })
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiPropertyOptional({
    description:
      'One or more account-number prefixes. PCL numbers are hierarchical (a parent number prefixes its children), so a prefix returns an intermediate sub-class and its whole subtree — e.g. "60" → 60, 601, 6011… A full account number returns that account. Repeat or comma-separate to fetch several subtrees at once, e.g. ?numberPrefix=60,70.',
    example: ['60', '70'],
    type: [String],
  })
  @IsOptional()
  @Transform(toStringArray)
  @IsString({ each: true })
  @MaxLength(20, { each: true })
  numberPrefix?: string[];

  @ApiPropertyOptional({
    description: 'Case-insensitive match on account number or name',
    example: 'cash',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({
    description:
      'Platform admin only: narrow to one company. Ignored for company-scoped callers.',
    example: 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab',
  })
  @IsOptional()
  @IsUUID()
  companyId?: string;
}
