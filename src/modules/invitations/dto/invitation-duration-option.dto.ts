import { ApiProperty } from '@nestjs/swagger';
import { InvitationDuration } from '@prisma/client';

// A selectable invitation-duration option for the frontend to render a dropdown
// (show `label`, submit `value`).
export class InvitationDurationOptionDto {
  @ApiProperty({
    enum: InvitationDuration,
    example: InvitationDuration.ONE_WEEK,
  })
  value!: InvitationDuration;

  @ApiProperty({ example: 'One week' })
  label!: string;

  @ApiProperty({
    description: 'How many days the invitation stays valid',
    example: 7,
  })
  days!: number;
}
