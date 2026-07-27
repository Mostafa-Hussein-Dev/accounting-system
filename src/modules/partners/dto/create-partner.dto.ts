import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { PartnerAddressDto } from './partner-address.dto';

const emptyToUndefined = ({ value }: { value: unknown }): unknown =>
  value === '' ? undefined : value;

export class CreatePartnerDto {
  @ApiPropertyOptional({
    description:
      'Odoo-style reference/number, unique per company. Leave blank to auto-generate as <control-account-number><zero-padded counter> — e.g. a customer under AR account 41 gets 410001, 410002, …',
    example: '410001',
  })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(50)
  ref?: string;

  @ApiProperty({ example: 'ACME Trading SARL' })
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ example: 'أكمي' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameAr?: string;

  @ApiPropertyOptional({ example: 'ACME SARL' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameFr?: string;

  @ApiPropertyOptional({ example: 'ACME Trading' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameEn?: string;

  @ApiPropertyOptional({
    description:
      'Partner sells to us / we sell to them (customer). At least one of isCustomer/isSupplier must be true.',
    example: true,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isCustomer?: boolean;

  @ApiPropertyOptional({
    description: 'We buy from them (supplier).',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isSupplier?: boolean;

  @ApiPropertyOptional({ example: 'Wholesale' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @ApiPropertyOptional({
    description: 'Tax identification number (MOF).',
    example: '1234567',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  tin?: string;

  @ApiPropertyOptional({ example: 'Sami Haddad' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  contactName?: string;

  @ApiPropertyOptional({ example: '+961 3 111 222' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @ApiPropertyOptional({ example: '+961 1 333 444' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone2?: string;

  @ApiPropertyOptional({ example: 'billing@acme.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @IsBoolean()
  vip?: boolean;

  @ApiPropertyOptional({
    description: 'Credit limit (FR-302, stored only).',
    example: 5000,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  creditLimit?: number;

  @ApiPropertyOptional({
    description: 'Currency of the credit limit.',
    example: 'USD',
  })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @Length(3, 3)
  creditCurrency?: string;

  @ApiPropertyOptional({
    description:
      "AR control account the customer's balance rolls into. Defaults to the company's AR (41) control account when the partner is a customer.",
    example: 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab',
  })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  receivableAccountId?: string;

  @ApiPropertyOptional({
    description:
      "AP control account the supplier's balance rolls into. Defaults to the company's AP (40) control account when the partner is a supplier.",
    example: 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab',
  })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  payableAccountId?: string;

  @ApiPropertyOptional({
    description: 'Region (no lookup model yet — stored as a passthrough id).',
  })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  regionId?: string;

  @ApiPropertyOptional({
    description: 'Assigned salesman (no lookup model yet — passthrough id).',
  })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  salesmanId?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description:
      'Platform admin: which company the partner belongs to. Ignored for a company-scoped caller (forced into their active company).',
    example: 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab',
  })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  companyId?: string;

  @ApiPropertyOptional({ type: [PartnerAddressDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PartnerAddressDto)
  addresses?: PartnerAddressDto[];
}
