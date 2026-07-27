import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Partner, PartnerAddress, PartnerAddressType } from '@prisma/client';

export class PartnerAddressResponseDto {
  @ApiProperty({ example: 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab' })
  id!: string;

  @ApiProperty({
    enum: PartnerAddressType,
    example: PartnerAddressType.BILLING,
  })
  type!: PartnerAddressType;

  @ApiProperty({ example: 'Rue Hamra, Bldg 12' })
  line1!: string;

  @ApiPropertyOptional({ nullable: true }) city!: string | null;
  @ApiPropertyOptional({ nullable: true }) country!: string | null;
  @ApiPropertyOptional({ nullable: true }) region!: string | null;
  @ApiPropertyOptional({ nullable: true }) phone!: string | null;
  @ApiProperty({ example: true }) isDefault!: boolean;

  static fromEntity(this: void, a: PartnerAddress): PartnerAddressResponseDto {
    const dto = new PartnerAddressResponseDto();
    dto.id = a.id;
    dto.type = a.type;
    dto.line1 = a.line1;
    dto.city = a.city;
    dto.country = a.country;
    dto.region = a.region;
    dto.phone = a.phone;
    dto.isDefault = a.isDefault;
    return dto;
  }
}

type PartnerWithAddresses = Partner & { addresses?: PartnerAddress[] };

export class PartnerResponseDto {
  @ApiProperty({ example: 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab' }) id!: string;
  @ApiProperty({ example: 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab' })
  companyId!: string;
  @ApiProperty({
    description: 'Partner reference/number (Odoo ref).',
    example: '410001',
  })
  ref!: string;
  @ApiProperty({ example: 'ACME Trading SARL' }) name!: string;
  @ApiPropertyOptional({ nullable: true }) nameAr!: string | null;
  @ApiPropertyOptional({ nullable: true }) nameFr!: string | null;
  @ApiPropertyOptional({ nullable: true }) nameEn!: string | null;
  @ApiProperty({ example: true }) isCustomer!: boolean;
  @ApiProperty({ example: false }) isSupplier!: boolean;
  @ApiPropertyOptional({ nullable: true }) category!: string | null;
  @ApiPropertyOptional({ nullable: true }) tin!: string | null;
  @ApiPropertyOptional({ nullable: true }) contactName!: string | null;
  @ApiPropertyOptional({ nullable: true }) phone!: string | null;
  @ApiPropertyOptional({ nullable: true }) phone2!: string | null;
  @ApiPropertyOptional({ nullable: true }) email!: string | null;
  @ApiProperty({ example: false }) vip!: boolean;
  @ApiPropertyOptional({ nullable: true, example: 5000 }) creditLimit!:
    number | null;
  @ApiPropertyOptional({ nullable: true, example: 'USD' }) creditCurrency!:
    string | null;
  @ApiPropertyOptional({ nullable: true }) receivableAccountId!: string | null;
  @ApiPropertyOptional({ nullable: true }) payableAccountId!: string | null;
  @ApiPropertyOptional({ nullable: true }) regionId!: string | null;
  @ApiPropertyOptional({ nullable: true }) salesmanId!: string | null;
  @ApiProperty({ example: true }) isActive!: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;

  @ApiPropertyOptional({
    type: PartnerAddressResponseDto,
    isArray: true,
    description: 'Present when the partner was loaded with its addresses.',
  })
  addresses?: PartnerAddressResponseDto[];

  static fromEntity(this: void, p: PartnerWithAddresses): PartnerResponseDto {
    const dto = new PartnerResponseDto();
    dto.id = p.id;
    dto.companyId = p.companyId;
    dto.ref = p.ref;
    dto.name = p.name;
    dto.nameAr = p.nameAr;
    dto.nameFr = p.nameFr;
    dto.nameEn = p.nameEn;
    dto.isCustomer = p.isCustomer;
    dto.isSupplier = p.isSupplier;
    dto.category = p.category;
    dto.tin = p.tin;
    dto.contactName = p.contactName;
    dto.phone = p.phone;
    dto.phone2 = p.phone2;
    dto.email = p.email;
    dto.vip = p.vip;
    dto.creditLimit = p.creditLimit === null ? null : Number(p.creditLimit);
    dto.creditCurrency = p.creditCurrency;
    dto.receivableAccountId = p.receivableAccountId;
    dto.payableAccountId = p.payableAccountId;
    dto.regionId = p.regionId;
    dto.salesmanId = p.salesmanId;
    dto.isActive = p.isActive;
    dto.createdAt = p.createdAt;
    dto.updatedAt = p.updatedAt;
    if (p.addresses) {
      dto.addresses = p.addresses.map(PartnerAddressResponseDto.fromEntity);
    }
    return dto;
  }
}
