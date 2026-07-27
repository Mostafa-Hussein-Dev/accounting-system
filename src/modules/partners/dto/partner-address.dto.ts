import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PartnerAddressType } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * One address of a partner. Supplying the partner's `addresses` array replaces
 * the whole set (like journal-entry lines). At most one may be `isDefault`; if
 * none is flagged, the first is made default (PartnersService).
 */
export class PartnerAddressDto {
  @ApiProperty({
    enum: PartnerAddressType,
    example: PartnerAddressType.BILLING,
  })
  @IsEnum(PartnerAddressType)
  type!: PartnerAddressType;

  @ApiProperty({ example: 'Rue Hamra, Bldg 12, 3rd floor' })
  @IsString()
  @MaxLength(255)
  line1!: string;

  @ApiPropertyOptional({ example: 'Beirut' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({ example: 'Lebanon' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  @ApiPropertyOptional({ example: 'Beirut Governorate' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  region?: string;

  @ApiPropertyOptional({ example: '+961 1 000 000' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @ApiPropertyOptional({
    description: 'Marks the default address (at most one per partner).',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
