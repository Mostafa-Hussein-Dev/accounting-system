import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateBranchDto {
  @ApiProperty({
    description:
      'Branch display name (fallback used when no localized name is set)',
    example: 'Beirut Main Branch',
  })
  @IsString()
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional({
    description: 'Arabic name',
    example: 'فرع بيروت الرئيسي',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  nameAr?: string;

  @ApiPropertyOptional({
    description: 'French name',
    example: 'Succursale principale de Beyrouth',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  nameFr?: string;

  @ApiPropertyOptional({
    description: 'English name',
    example: 'Beirut Main Branch',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  nameEn?: string;

  @ApiPropertyOptional({
    description: 'Postal address of the branch',
    example: 'Hamra Street, Beirut, Lebanon',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional({
    description:
      'Existing INTERNAL stock location to use as this branch default (FR-402). If omitted, a default location is created automatically for the branch.',
    example: 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab',
  })
  @IsOptional()
  @IsUUID()
  stockLocationId?: string;

  @ApiPropertyOptional({
    description:
      'Company this branch belongs to. A company-scoped caller is always forced into their own company — this field is ignored/overridden. A platform admin must target a company via this field or the ?companyId query param.',
    example: 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab',
  })
  @IsOptional()
  @IsUUID()
  companyId?: string;
}
