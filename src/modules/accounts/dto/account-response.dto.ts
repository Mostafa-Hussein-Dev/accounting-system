import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Account,
  AccountType,
  ControlType,
  NormalBalance,
} from '@prisma/client';

export class AccountResponseDto {
  @ApiProperty({ example: 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab' })
  id!: string;

  @ApiProperty({ example: '586b91ef-6b89-4e9b-bcaa-99976d65fc4a' })
  companyId!: string;

  @ApiProperty({ example: '4111' })
  number!: string;

  @ApiProperty({ example: 'Customers' })
  name!: string;

  @ApiPropertyOptional({ example: 'العملاء', nullable: true })
  nameAr!: string | null;

  @ApiPropertyOptional({ example: 'Clients', nullable: true })
  nameFr!: string | null;

  @ApiPropertyOptional({ example: 'Customers', nullable: true })
  nameEn!: string | null;

  @ApiProperty({ example: 4 })
  accountClass!: number;

  @ApiProperty({ enum: AccountType, example: AccountType.ASSET })
  type!: AccountType;

  @ApiProperty({ enum: NormalBalance, example: NormalBalance.DEBIT })
  normalBalance!: NormalBalance;

  @ApiPropertyOptional({ example: null, nullable: true })
  parentId!: string | null;

  @ApiPropertyOptional({
    description:
      'Single-currency restriction (ISO 4217), or null for multi-currency.',
    example: null,
    nullable: true,
  })
  currencyRestriction!: string | null;

  @ApiProperty({ example: true })
  isControl!: boolean;

  @ApiPropertyOptional({
    enum: ControlType,
    example: ControlType.AR,
    nullable: true,
  })
  controlType!: ControlType | null;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({ example: '2026-07-18T14:30:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-07-18T14:30:00.000Z' })
  updatedAt!: Date;

  static fromEntity(this: void, account: Account): AccountResponseDto {
    const dto = new AccountResponseDto();
    dto.id = account.id;
    dto.companyId = account.companyId;
    dto.number = account.number;
    dto.name = account.name;
    dto.nameAr = account.nameAr;
    dto.nameFr = account.nameFr;
    dto.nameEn = account.nameEn;
    dto.accountClass = account.accountClass;
    dto.type = account.type;
    dto.normalBalance = account.normalBalance;
    dto.parentId = account.parentId;
    dto.currencyRestriction = account.currencyRestriction;
    dto.isControl = account.isControl;
    dto.controlType = account.controlType;
    dto.isActive = account.isActive;
    dto.createdAt = account.createdAt;
    dto.updatedAt = account.updatedAt;
    return dto;
  }
}
