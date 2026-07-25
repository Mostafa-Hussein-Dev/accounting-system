import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserResponseDto } from '../../users/dto/user-response.dto';
import { AuthCompanyDto } from './auth-response.dto';

/**
 * The current user plus their company context: which company the token is
 * scoped to right now (activeCompanyId) and every company they belong to
 * (companies) — the latter is what a client shows in a "switch company" menu.
 */
export class MeResponseDto extends UserResponseDto {
  @ApiPropertyOptional({
    description:
      'The company this token is scoped to. null for a platform admin, or a multi-company user who has not selected one yet.',
    example: 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab',
    nullable: true,
  })
  activeCompanyId!: string | null;

  @ApiProperty({
    description:
      'Every company the user belongs to (empty for a platform admin).',
    type: AuthCompanyDto,
    isArray: true,
  })
  companies!: AuthCompanyDto[];

  @ApiProperty({
    description:
      'True while the user must change a temp password before using the account — every route except change-password is blocked until they do.',
    example: false,
  })
  mustChangePassword!: boolean;
}
