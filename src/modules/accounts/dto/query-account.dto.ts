import { ApiPropertyOptional } from '@nestjs/swagger';
import { AccountType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
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

// Filters for the flat account list. All optional — combined with AND.
export class QueryAccountDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by class (1–7)', example: 4 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(7)
  accountClass?: number;

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
      'Account-number prefix. In the Plan Comptable Libanais numbers are hierarchical (a parent number is a prefix of its children), so this returns an intermediate sub-class and its whole subtree — e.g. "60" → 60, 601, 6011… A full account number returns that account (and anything nested under it).',
    example: '60',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  numberPrefix?: string;

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
