import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role, RolePermission, Permission } from '@prisma/client';

type RoleWithPermissions = Role & {
  permissions: (RolePermission & { permission: Permission })[];
};

export class RoleResponseDto {
  @ApiProperty({ example: 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab' })
  id!: string;

  @ApiProperty({ example: 'Company Admin' })
  name!: string;

  @ApiPropertyOptional({
    example: "Full administrative access within the company's own data.",
    nullable: true,
  })
  description!: string | null;

  @ApiPropertyOptional({
    description:
      "null for a global role usable by every company; set to a specific company for that company's own custom role.",
    example: null,
    nullable: true,
  })
  companyId!: string | null;

  @ApiProperty({
    description:
      'System roles (the seeded Company Admin/Company Member) can never be updated or deleted via the API.',
    example: true,
  })
  isSystem!: boolean;

  @ApiProperty({
    description: 'Permission keys granted by this role.',
    example: ['company.read', 'company.update', 'user.create'],
    type: [String],
  })
  permissions!: string[];

  @ApiProperty({ example: '2025-06-03T14:30:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2025-06-03T14:30:00.000Z' })
  updatedAt!: Date;

  static fromEntity(this: void, role: RoleWithPermissions): RoleResponseDto {
    const dto = new RoleResponseDto();
    dto.id = role.id;
    dto.name = role.name;
    dto.description = role.description;
    dto.companyId = role.companyId;
    dto.isSystem = role.isSystem;
    dto.permissions = role.permissions.map((rp) => rp.permission.key);
    dto.createdAt = role.createdAt;
    dto.updatedAt = role.updatedAt;
    return dto;
  }
}
