import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Invitation, InvitationDuration } from '@prisma/client';

// Never exposes the token or tempPasswordHash — those are secrets.
export class InvitationResponseDto {
  @ApiProperty({ example: 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab' })
  id!: string;

  @ApiProperty({ example: '586b91ef-6b89-4e9b-bcaa-99976d65fc4a' })
  companyId!: string;

  @ApiProperty({ example: 'sam@acme.com' })
  email!: string;

  @ApiProperty({ example: 'Sam' })
  firstName!: string;

  @ApiProperty({ example: 'Lee' })
  lastName!: string;

  @ApiProperty({ type: [String], example: ['b3f1c2e0-...'] })
  roleIds!: string[];

  @ApiProperty({ example: false })
  accepted!: boolean;

  @ApiProperty({
    enum: InvitationDuration,
    example: InvitationDuration.ONE_WEEK,
  })
  duration!: InvitationDuration;

  @ApiProperty({ example: '2026-08-02T00:00:00.000Z' })
  expiresAt!: Date;

  @ApiPropertyOptional({ nullable: true, example: null })
  acceptedAt!: Date | null;

  @ApiProperty({ example: '2026-07-26T09:00:00.000Z' })
  createdAt!: Date;

  static fromEntity(this: void, inv: Invitation): InvitationResponseDto {
    const dto = new InvitationResponseDto();
    dto.id = inv.id;
    dto.companyId = inv.companyId;
    dto.email = inv.email;
    dto.firstName = inv.firstName;
    dto.lastName = inv.lastName;
    dto.roleIds = inv.roleIds;
    dto.accepted = inv.accepted;
    dto.duration = inv.duration;
    dto.expiresAt = inv.expiresAt;
    dto.acceptedAt = inv.acceptedAt;
    dto.createdAt = inv.createdAt;
    return dto;
  }
}
