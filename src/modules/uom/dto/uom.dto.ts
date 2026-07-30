import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { UomType, Uom } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

const emptyToUndefined = ({ value }: { value: unknown }): unknown =>
  value === '' ? undefined : value;

export class CreateUomDto {
  @ApiProperty({
    description: 'UoM category — units only convert within a category.',
  })
  @IsUUID()
  categoryId!: string;

  @ApiProperty({ example: 'Dozen' })
  @IsString()
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  nameAr?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  nameFr?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  nameEn?: string;

  @ApiProperty({ enum: UomType, example: UomType.BIGGER })
  @IsEnum(UomType)
  type!: UomType;

  @ApiPropertyOptional({
    description:
      'Reference units per one of this unit (reference = 1, dozen = 12, gram vs kg reference = 0.001). Required unless type is REFERENCE (forced to 1).',
    example: 12,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @IsPositive()
  factor?: number;

  @ApiPropertyOptional({ example: 0.01, default: 0.01 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @IsPositive()
  rounding?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description:
      'Platform admin: which company. Ignored for a company-scoped caller.',
  })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  companyId?: string;
}

export class UpdateUomDto extends PartialType(CreateUomDto) {}

export class UomResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() companyId!: string;
  @ApiProperty() categoryId!: string;
  @ApiProperty({ example: 'Dozen' }) name!: string;
  @ApiPropertyOptional({ nullable: true }) nameAr!: string | null;
  @ApiPropertyOptional({ nullable: true }) nameFr!: string | null;
  @ApiPropertyOptional({ nullable: true }) nameEn!: string | null;
  @ApiProperty({ enum: UomType }) type!: UomType;
  @ApiProperty({ example: 12 }) factor!: number;
  @ApiProperty({ example: 0.01 }) rounding!: number;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;

  static fromEntity(this: void, u: Uom): UomResponseDto {
    const dto = new UomResponseDto();
    dto.id = u.id;
    dto.companyId = u.companyId;
    dto.categoryId = u.categoryId;
    dto.name = u.name;
    dto.nameAr = u.nameAr;
    dto.nameFr = u.nameFr;
    dto.nameEn = u.nameEn;
    dto.type = u.type;
    dto.factor = Number(u.factor);
    dto.rounding = Number(u.rounding);
    dto.isActive = u.isActive;
    dto.createdAt = u.createdAt;
    dto.updatedAt = u.updatedAt;
    return dto;
  }
}

export class ConvertUomDto {
  @ApiProperty({ description: 'Quantity to convert.', example: 3 })
  @IsNumber({ maxDecimalPlaces: 6 })
  @IsPositive()
  @Transform(({ value }: { value: unknown }) => Number(value))
  qty!: number;

  @ApiProperty({ description: 'Source UoM id.' })
  @IsUUID()
  fromUomId!: string;

  @ApiProperty({ description: 'Target UoM id (same category as source).' })
  @IsUUID()
  toUomId!: string;
}

export class ConvertUomResponseDto {
  @ApiProperty({ example: 3 }) qty!: number;
  @ApiProperty() fromUomId!: string;
  @ApiProperty() toUomId!: string;
  @ApiProperty({
    description: 'Converted quantity (rounded to the target UoM rounding).',
    example: 36,
  })
  result!: number;
}
