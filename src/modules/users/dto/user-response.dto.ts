import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Language, User } from '@prisma/client';

export class UserResponseDto {
  @ApiProperty({ example: 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab' })
  id!: string;

  @ApiProperty({ example: 'Jane' })
  firstName!: string;

  @ApiProperty({ example: 'Doe' })
  lastName!: string;

  @ApiProperty({ example: 'jane.doe@example.com' })
  email!: string;

  @ApiPropertyOptional({ example: '+961 3 123 456', nullable: true })
  phone!: string | null;

  @ApiPropertyOptional({
    example: 'https://cdn.example.com/avatars/jane.png',
    nullable: true,
  })
  avatarUrl!: string | null;

  @ApiProperty({ enum: Language, example: Language.EN })
  preferredLanguage!: Language;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiPropertyOptional({
    example: '2025-06-03T14:30:00.000Z',
    nullable: true,
  })
  lastLoginAt!: Date | null;

  @ApiProperty({
    description:
      'Platform/support account (no company membership; sees across tenants).',
    example: false,
  })
  isPlatformAdmin!: boolean;

  @ApiProperty({ example: '2025-06-03T14:30:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2025-06-03T14:30:00.000Z' })
  updatedAt!: Date;

  static fromEntity(this: void, user: User): UserResponseDto {
    const dto = new UserResponseDto();
    dto.id = user.id;
    dto.firstName = user.firstName;
    dto.lastName = user.lastName;
    dto.email = user.email;
    dto.phone = user.phone;
    dto.avatarUrl = user.avatarUrl;
    dto.preferredLanguage = user.preferredLanguage;
    dto.isActive = user.isActive;
    dto.lastLoginAt = user.lastLoginAt;
    dto.isPlatformAdmin = user.isPlatformAdmin;
    dto.createdAt = user.createdAt;
    dto.updatedAt = user.updatedAt;
    return dto;
  }
}
