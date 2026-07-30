import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

const emptyToUndefined = ({ value }: { value: unknown }): unknown =>
  value === '' ? undefined : value;

export class CreateUomCategoryDto {
  @ApiProperty({ example: 'Unit' })
  @IsString()
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ example: 'وحدة' })
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

  @ApiPropertyOptional({
    description:
      'Platform admin: which company. Ignored for a company-scoped caller.',
  })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  companyId?: string;
}

export class UpdateUomCategoryDto extends PartialType(CreateUomCategoryDto) {}

export class UomCategoryResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() companyId!: string;
  @ApiProperty({ example: 'Unit' }) name!: string;
  @ApiPropertyOptional({ nullable: true }) nameAr!: string | null;
  @ApiPropertyOptional({ nullable: true }) nameFr!: string | null;
  @ApiPropertyOptional({ nullable: true }) nameEn!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;

  static fromEntity(
    this: void,
    c: {
      id: string;
      companyId: string;
      name: string;
      nameAr: string | null;
      nameFr: string | null;
      nameEn: string | null;
      createdAt: Date;
      updatedAt: Date;
    },
  ): UomCategoryResponseDto {
    const dto = new UomCategoryResponseDto();
    Object.assign(dto, c);
    return dto;
  }
}
