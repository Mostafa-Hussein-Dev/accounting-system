import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';

const emptyToUndefined = ({ value }: { value: unknown }): unknown =>
  value === '' ? undefined : value;

const toStringArray = ({ value }: { value: unknown }): unknown => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    const parts = value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return parts.length ? parts : undefined;
  }
  return value;
};

const toBool = ({ value }: { value: unknown }): unknown => {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};

export type OnHandBreakdown = 'total' | 'byLocation';

export class BulkOnHandQueryDto {
  @ApiPropertyOptional({
    description:
      'Comma-separated item ids (or repeated query params). Omit for every item that has stock.',
    type: [String],
  })
  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @IsUUID('all', { each: true })
  itemIds?: string[];

  @ApiPropertyOptional({ description: 'Restrict to one variant.' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  variantId?: string;

  @ApiPropertyOptional({ description: 'Restrict to one internal location.' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  locationId?: string;

  @ApiPropertyOptional({
    description: 'Restrict to the internal locations of one branch.',
  })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional({
    enum: ['total', 'byLocation'],
    default: 'total',
    description:
      'total = one row per item/variant (summed across internal locations); byLocation = one row per item/variant/location.',
  })
  @IsOptional()
  @IsIn(['total', 'byLocation'])
  breakdown?: OnHandBreakdown = 'total';

  @ApiPropertyOptional({
    default: false,
    description: 'Include rows whose on-hand nets to zero.',
  })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  includeZero?: boolean = false;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 100;

  @ApiPropertyOptional({ description: 'Platform admin: which company.' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  companyId?: string;
}

export class OnHandRowDto {
  @ApiProperty() itemId!: string;
  @ApiPropertyOptional({ nullable: true }) variantId!: string | null;
  @ApiPropertyOptional({
    nullable: true,
    description: 'Null for a total row; set for a byLocation row.',
  })
  locationId!: string | null;
  @ApiPropertyOptional({ nullable: true }) locationCode!: string | null;
  @ApiProperty({ example: 40 }) qty!: number;
  @ApiProperty({ example: 4.5 }) avgCost!: number;
  @ApiProperty({ example: 180 }) value!: number;
  @ApiProperty({ example: 'USD' }) currency!: string;
}
