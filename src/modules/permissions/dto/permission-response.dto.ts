import { ApiProperty } from '@nestjs/swagger';
import { Permission } from '@prisma/client';

export class PermissionResponseDto {
  @ApiProperty({ example: 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab' })
  id!: string;

  @ApiProperty({ example: 'account.read' })
  key!: string;

  @ApiProperty({ example: 'Account' })
  subject!: string;

  @ApiProperty({ example: 'read' })
  action!: string;

  @ApiProperty({ example: 'View chart of accounts' })
  description!: string;

  static fromEntity(this: void, p: Permission): PermissionResponseDto {
    const dto = new PermissionResponseDto();
    dto.id = p.id;
    dto.key = p.key;
    dto.subject = p.subject;
    dto.action = p.action;
    dto.description = p.description;
    return dto;
  }
}
