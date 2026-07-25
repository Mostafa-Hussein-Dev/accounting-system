import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AuthCompanyDto {
  @ApiProperty({ example: 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab' })
  id!: string;

  @ApiProperty({ example: 'Demo Company' })
  name!: string;
}

export class AuthResponseDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  accessToken!: string;

  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  refreshToken!: string;

  @ApiProperty({ example: 'Bearer' })
  tokenType!: string;

  @ApiProperty({
    description: 'Access token lifetime in seconds',
    example: 900,
  })
  expiresIn!: number;

  @ApiProperty({
    description:
      'Every company the user belongs to. Empty for a platform admin. Use POST /auth/switch-company to change the active one.',
    type: AuthCompanyDto,
    isArray: true,
  })
  companies!: AuthCompanyDto[];

  @ApiPropertyOptional({
    description:
      'The company this token is scoped to. null for a platform admin, or when the user belongs to several and has not selected one yet.',
    example: 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab',
    nullable: true,
  })
  activeCompanyId!: string | null;

  @ApiProperty({
    description:
      'True when the account was created from a temporary password and must change it before using the app. The frontend should redirect to a change-password screen; every other API route returns 403 PASSWORD_CHANGE_REQUIRED until it is changed.',
    example: false,
  })
  mustChangePassword!: boolean;
}
