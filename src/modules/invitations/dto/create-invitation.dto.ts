import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InvitationDuration } from '@prisma/client';
import { Transform } from 'class-transformer';
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

  @ApiPropertyOptional({
    description:
      'Required only when inviting a NEW email (used to create the account on acceptance). Ignored/optional for an existing user, who keeps their own profile — their stored name is used.',
    example: 'Sam',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional({
    description: 'Required only when inviting a NEW email (see firstName).',
    example: 'Lee',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

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
      'Platform admin: which company to invite into (required for them). A company-scoped caller is ALWAYS forced into their active company (from the JWT) and this field is ignored — an empty value is treated as omitted.',
    example: 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === '' ? undefined : value,
  )
  @IsUUID()
  companyId?: string;
}
