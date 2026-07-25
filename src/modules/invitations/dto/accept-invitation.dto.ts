import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class AcceptInvitationDto {
  @ApiProperty({
    description: 'The token from the invitation email/link.',
    example: '9f2c1a8b7e6d5c4b3a2f1e0d9c8b7a6f5e4d3c2b1a0f9e8d7c6b5a4938271605',
  })
  @IsString()
  @IsNotEmpty()
  token!: string;
}
