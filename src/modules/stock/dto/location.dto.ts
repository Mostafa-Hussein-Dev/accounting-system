import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { Location, LocationType } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

const emptyToUndefined = ({ value }: { value: unknown }): unknown =>
  value === '' ? undefined : value;

// Only INTERNAL locations are user-managed; the virtual counterparties
// (CUSTOMER/SUPPLIER/ADJUSTMENT/TRANSIT) are seeded per company and never
// created via the API, so create/update never accept a `type`.
export class CreateLocationDto {
  @ApiProperty({
    description: 'Unique code within the company.',
    example: 'WH-MAIN',
  })
  @IsString()
  @MaxLength(50)
  code!: string;

  @ApiProperty({ example: 'Main Warehouse' })
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

  @ApiProperty({ description: 'Branch this internal location belongs to.' })
  @IsUUID()
  branchId!: string;

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

export class UpdateLocationDto {
  @ApiPropertyOptional({ example: 'Main Warehouse' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

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

  @ApiPropertyOptional({ description: 'Move the location to another branch.' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class QueryLocationDto {
  @ApiPropertyOptional({ enum: LocationType })
  @IsOptional()
  @IsEnum(LocationType)
  type?: LocationType;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional({
    description: 'Platform admin: filter to one company.',
  })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  companyId?: string;
}

export class LocationResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() companyId!: string;
  @ApiProperty({ example: 'WH-MAIN' }) code!: string;
  @ApiProperty({ example: 'Main Warehouse' }) name!: string;
  @ApiPropertyOptional({ nullable: true }) nameAr!: string | null;
  @ApiPropertyOptional({ nullable: true }) nameFr!: string | null;
  @ApiPropertyOptional({ nullable: true }) nameEn!: string | null;
  @ApiProperty({ enum: LocationType }) type!: LocationType;
  @ApiPropertyOptional({ nullable: true }) branchId!: string | null;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;

  static fromEntity(this: void, l: Location): LocationResponseDto {
    const dto = new LocationResponseDto();
    dto.id = l.id;
    dto.companyId = l.companyId;
    dto.code = l.code;
    dto.name = l.name;
    dto.nameAr = l.nameAr;
    dto.nameFr = l.nameFr;
    dto.nameEn = l.nameEn;
    dto.type = l.type;
    dto.branchId = l.branchId;
    dto.isActive = l.isActive;
    dto.createdAt = l.createdAt;
    dto.updatedAt = l.updatedAt;
    return dto;
  }
}
