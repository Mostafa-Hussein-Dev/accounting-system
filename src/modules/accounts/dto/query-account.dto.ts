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

// Query strings arrive as strings, and Boolean('false') === true, so
// `@Type(() => Boolean)` would treat ?flag=false as true. Map the two literal
// strings explicitly and leave anything else for @IsBoolean to reject.
const toBoolean = ({ value }: { value: unknown }): unknown => {
  if (value === true || value === 'true') {
    return true;
  }
  if (value === false || value === 'false') {
    return false;
  }
  return value;
};

// List query params arrive either repeated (?x=a&x=b -> ['a','b']) or comma-
// joined (?x=a,b). Normalize both to a trimmed, non-empty array so a single
// value and a list are handled the same way.
const toStringArray = ({ value }: { value: unknown }): unknown => {
  if (value === undefined || value === null) {
    return value;
  }
  const raw: unknown[] = Array.isArray(value) ? value : [value];
  const out: string[] = [];
  for (const item of raw) {
    // Only split/keep strings; any non-string is left out for @IsString to flag.
    if (typeof item !== 'string') {
      continue;
    }
    for (const part of item.split(',')) {
      const trimmed = part.trim();
      if (trimmed.length > 0) {
        out.push(trimmed);
      }
    }
  }
  return out;
};

const toNumberArray = ({ value }: { value: unknown }): unknown => {
  const arr = toStringArray({ value });
  return Array.isArray(arr) ? arr.map((v) => Number(v)) : arr;
};

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
