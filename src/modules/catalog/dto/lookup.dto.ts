import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

const emptyToUndefined = ({ value }: { value: unknown }): unknown =>
  value === '' ? undefined : value;

export class CreateLookupDto {
  @ApiProperty({ example: 'Electronics' })
  @IsString()
  @MaxLength(150)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  nameAr?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  nameFr?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  nameEn?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({
    description:
      'Platform admin: which company. Ignored for a company-scoped caller.',
  })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  companyId?: string;
}

export class UpdateLookupDto extends PartialType(CreateLookupDto) {}

// ItemCategory adds an optional self-referential parent and the FR-6xx
// revenue/COGS posting-account overrides for items in the category.
export class CreateCategoryDto extends CreateLookupDto {
  @ApiPropertyOptional({
    description: 'Parent category (same company) for nesting.',
  })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  parentId?: string;

  @ApiPropertyOptional({
    description:
      'Revenue account for items in this category (below the item override, above the company default).',
  })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  revenueAccountId?: string;

  @ApiPropertyOptional({
    description:
      'COGS account for items in this category (below the item override, above the company default).',
  })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  cogsAccountId?: string;
}

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}

export class LookupResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() companyId!: string;
  @ApiProperty({ example: 'Electronics' }) name!: string;
  @ApiPropertyOptional({ nullable: true }) nameAr!: string | null;
  @ApiPropertyOptional({ nullable: true }) nameFr!: string | null;
  @ApiPropertyOptional({ nullable: true }) nameEn!: string | null;
  @ApiProperty({ example: 0 }) sortOrder!: number;
  @ApiPropertyOptional({
    nullable: true,
    description: 'Only present for categories.',
  })
  parentId?: string | null;
  @ApiPropertyOptional({
    nullable: true,
    description: 'Only present for categories (revenue override).',
  })
  revenueAccountId?: string | null;
  @ApiPropertyOptional({
    nullable: true,
    description: 'Only present for categories (COGS override).',
  })
  cogsAccountId?: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
