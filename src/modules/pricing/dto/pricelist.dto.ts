import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { Pricelist } from '@prisma/client';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from 'class-validator';

const emptyToUndefined = ({ value }: { value: unknown }): unknown =>
  value === '' ? undefined : value;

export class CreatePricelistDto {
  @ApiProperty({ example: 'LBP Retail' })
  @IsString()
  @MaxLength(150)
  name!: string;

  @ApiProperty({
    description: 'Currency of the prices in this list.',
    example: 'LBP',
  })
  @IsString()
  @Length(3, 3)
  currencyCode!: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Platform admin: which company.' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  companyId?: string;
}

export class UpdatePricelistDto extends PartialType(CreatePricelistDto) {}

export class PricelistResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() companyId!: string;
  @ApiProperty({ example: 'LBP Retail' }) name!: string;
  @ApiProperty({ example: 'LBP' }) currencyCode!: string;
  @ApiProperty() isDefault!: boolean;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;

  static fromEntity(this: void, p: Pricelist): PricelistResponseDto {
    const dto = new PricelistResponseDto();
    dto.id = p.id;
    dto.companyId = p.companyId;
    dto.name = p.name;
    dto.currencyCode = p.currencyCode;
    dto.isDefault = p.isDefault;
    dto.isActive = p.isActive;
    dto.createdAt = p.createdAt;
    dto.updatedAt = p.updatedAt;
    return dto;
  }
}
