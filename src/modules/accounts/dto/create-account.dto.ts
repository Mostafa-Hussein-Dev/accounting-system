import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AccountType, ControlType, NormalBalance } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateAccountDto {
  @ApiProperty({
    description: 'Account number, unique within the company.',
    example: '4111',
  })
  @IsString()
  @MaxLength(50)
  number!: string;

  @ApiProperty({
    description: 'Display name (fallback used when no localized name is set)',
    example: 'Customers',
  })
  @IsString()
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional({ description: 'Arabic name', example: 'العملاء' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  nameAr?: string;

  @ApiPropertyOptional({ description: 'French name', example: 'Clients' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  nameFr?: string;

  @ApiPropertyOptional({ description: 'English name', example: 'Customers' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  nameEn?: string;

  @ApiProperty({
    description: 'Plan Comptable Libanais class (1–7).',
    example: 4,
    minimum: 1,
    maximum: 7,
  })
  @IsInt()
  @Min(1)
  @Max(7)
  accountClass!: number;

  @ApiProperty({ enum: AccountType, example: AccountType.ASSET })
  @IsEnum(AccountType)
  type!: AccountType;

  @ApiProperty({ enum: NormalBalance, example: NormalBalance.DEBIT })
  @IsEnum(NormalBalance)
  normalBalance!: NormalBalance;

  @ApiPropertyOptional({
    description:
      'Parent account id for nesting/roll-up. Must be in the same company.',
    example: 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab',
  })
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiPropertyOptional({
    description:
      'Restrict this account to a single currency (ISO 4217 code). Omit for a multi-currency account.',
    example: 'USD',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/, {
    message: 'currencyRestriction must be a 3-letter uppercase ISO 4217 code',
  })
  currencyRestriction?: string;

  @ApiPropertyOptional({
    description:
      'Marks a control account that fronts a sub-ledger (AR/AP/VAT/cash/bank) and may not be posted to directly.',
    example: true,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isControl?: boolean;

  @ApiPropertyOptional({
    enum: ControlType,
    description:
      'Which sub-ledger this control account fronts. Only valid when isControl is true.',
    example: ControlType.AR,
  })
  @IsOptional()
  @IsEnum(ControlType)
  controlType?: ControlType;

  @ApiPropertyOptional({
    description:
      'Whether the account is active (available for posting/selection).',
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description:
      'Company this account belongs to. A company-scoped caller is always forced into their own company — this field is ignored/overridden. A platform admin must target a company via this field.',
    example: 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab',
  })
  @IsOptional()
  @IsUUID()
  companyId?: string;
}
