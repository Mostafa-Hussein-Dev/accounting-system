import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateRoleDto {
  @ApiProperty({ example: 'Sales Manager' })
  @IsString()
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({
    example: 'Manages the sales team and approves discounts.',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description:
      "Omit to create a global role usable by every company (platform admin only). A company-scoped caller is always forced into their own company — this field is ignored/overridden if it doesn't match. Platform admin may also supply this to create a custom role on behalf of a specific company.",
    example: 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab',
  })
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @ApiProperty({
    description: 'Permissions granted by this role.',
    example: ['d9d968e2-be6b-473e-b504-e7f90c1fd005'],
    type: [String],
  })
  @IsArray()
  @IsUUID('4', { each: true })
  permissionIds!: string[];
}
