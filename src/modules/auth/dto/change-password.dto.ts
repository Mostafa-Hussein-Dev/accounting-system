import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({
    description: 'The current password (the temp password for a first change).',
    example: 'nomH1BoAf_LS',
  })
  @IsString()
  @MinLength(1)
  currentPassword!: string;

  @ApiProperty({
    description: 'The new password.',
    example: 'BrandNewP@ssword2',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  newPassword!: string;
}
