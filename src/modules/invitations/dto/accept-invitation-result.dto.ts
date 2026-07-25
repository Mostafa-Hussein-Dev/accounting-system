import { ApiProperty } from '@nestjs/swagger';

export class AcceptInvitationResultDto {
  @ApiProperty({ example: '586b91ef-6b89-4e9b-bcaa-99976d65fc4a' })
  companyId!: string;

  @ApiProperty({ example: 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab' })
  userId!: string;

  @ApiProperty({
    description: 'Whether a brand-new user account was created on acceptance.',
    example: true,
  })
  isNewUser!: boolean;
}
