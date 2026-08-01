import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Branch } from '@prisma/client';

export class BranchResponseDto {
  @ApiProperty({ example: 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab' })
  id!: string;

  @ApiProperty({ example: '586b91ef-6b89-4e9b-bcaa-99976d65fc4a' })
  companyId!: string;

  @ApiProperty({ example: 'Beirut Main Branch' })
  name!: string;

  @ApiPropertyOptional({ example: 'فرع بيروت الرئيسي', nullable: true })
  nameAr!: string | null;

  @ApiPropertyOptional({
    example: 'Succursale principale de Beyrouth',
    nullable: true,
  })
  nameFr!: string | null;

  @ApiPropertyOptional({ example: 'Beirut Main Branch', nullable: true })
  nameEn!: string | null;

  @ApiPropertyOptional({
    example: 'Hamra Street, Beirut, Lebanon',
    nullable: true,
  })
  address!: string | null;

  @ApiPropertyOptional({
    description:
      'Stock location this branch draws from (null until the inventory module ships).',
    example: null,
    nullable: true,
  })
  stockLocationId!: string | null;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({ example: '2025-06-03T14:30:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2025-06-03T14:30:00.000Z' })
  updatedAt!: Date;

  static fromEntity(this: void, branch: Branch): BranchResponseDto {
    const dto = new BranchResponseDto();
    dto.id = branch.id;
    dto.companyId = branch.companyId;
    dto.name = branch.name;
    dto.nameAr = branch.nameAr;
    dto.nameFr = branch.nameFr;
    dto.nameEn = branch.nameEn;
    dto.address = branch.address;
    dto.stockLocationId = branch.stockLocationId;
    dto.isActive = branch.isActive;
    dto.createdAt = branch.createdAt;
    dto.updatedAt = branch.updatedAt;
    return dto;
  }
}
