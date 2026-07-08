import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Language } from '@prisma/client';
import {
  IsArray,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'Jane' })
  @IsString()
  @MaxLength(100)
  firstName!: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  @MaxLength(100)
  lastName!: string;

  @ApiProperty({ example: 'jane.doe@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({
    description:
      'Plain-text password, hashed server-side and never stored or returned as-is.',
    example: 'S3cur3P@ssword!',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;

  @ApiPropertyOptional({ example: '+961 3 123 456' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @ApiPropertyOptional({
    example: 'https://cdn.example.com/avatars/jane.png',
  })
  @IsOptional()
  @IsUrl()
  avatarUrl?: string;

  @ApiPropertyOptional({
    enum: Language,
    example: Language.EN,
    default: Language.EN,
  })
  @IsOptional()
  @IsEnum(Language)
  preferredLanguage?: Language;

  @ApiPropertyOptional({
    description:
      'Company this user belongs to. Omit for a system-level user (admin/support).',
    example: 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab',
  })
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @ApiPropertyOptional({
    description:
      'Roles to assign. A company-scoped caller creating a teammate without specifying this defaults to the Company Member role.',
    example: ['b3f1c2e0-1234-4a5b-9c8d-1234567890ab'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  roleIds?: string[];
}
