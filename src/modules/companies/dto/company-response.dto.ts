import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Company } from '@prisma/client';

export class CompanyResponseDto {
  @ApiProperty({ example: 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab' })
  id!: string;

  @ApiProperty({ example: 'Beirut Trading Co.' })
  name!: string;

  @ApiPropertyOptional({ example: 'LB-123456', nullable: true })
  taxNumber!: string | null;

  @ApiPropertyOptional({ example: '+961 1 234 567', nullable: true })
  phone!: string | null;

  @ApiPropertyOptional({ example: 'info@beiruttrading.com', nullable: true })
  email!: string | null;

  @ApiPropertyOptional({
    example: 'https://cdn.example.com/logo.png',
    nullable: true,
  })
  logo!: string | null;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({
    description: 'Base currency the books are kept in',
    example: 'USD',
  })
  baseCurrencyCode!: string;

  @ApiProperty({ description: 'Fiscal-year start month (1–12)', example: 1 })
  fiscalYearStartMonth!: number;

  @ApiProperty({ example: '2025-06-03T14:30:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2025-06-03T14:30:00.000Z' })
  updatedAt!: Date;

  static fromEntity(this: void, company: Company): CompanyResponseDto {
    const dto = new CompanyResponseDto();
    dto.id = company.id;
    dto.name = company.name;
    dto.taxNumber = company.taxNumber;
    dto.phone = company.phone;
    dto.email = company.email;
    dto.logo = company.logo;
    dto.isActive = company.isActive;
    dto.baseCurrencyCode = company.baseCurrencyCode;
    dto.fiscalYearStartMonth = company.fiscalYearStartMonth;
    dto.createdAt = company.createdAt;
    dto.updatedAt = company.updatedAt;
    return dto;
  }
}
