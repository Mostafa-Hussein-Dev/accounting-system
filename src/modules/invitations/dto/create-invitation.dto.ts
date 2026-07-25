import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InvitationDuration } from '@prisma/client';
import {
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateInvitationDto {
  @ApiProperty({ example: 'sam@acme.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Sam' })
  @IsString()
  @MaxLength(100)
  firstName!: string;

  @ApiProperty({ example: 'Lee' })
  @IsString()
  @MaxLength(100)
  lastName!: string;

  @ApiProperty({
    description: 'Roles to grant on acceptance (role ids from GET /roles).',
    type: [String],
    example: ['b3f1c2e0-1234-4a5b-9c8d-1234567890ab'],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  roleIds!: string[];

  @ApiProperty({
    enum: InvitationDuration,
    description: 'How long the invitation stays valid.',
    example: InvitationDuration.ONE_WEEK,
  })
  @IsEnum(InvitationDuration)
  duration!: InvitationDuration;

  @ApiPropertyOptional({
    description:
      'Platform admin: which company to invite into. A company user is always forced into their active company.',
    example: 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab',
  })
  @IsOptional()
  @IsUUID()
  companyId?: string;
}
