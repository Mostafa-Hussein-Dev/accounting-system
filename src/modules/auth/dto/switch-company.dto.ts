import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class SwitchCompanyDto {
  @ApiProperty({
    description:
      'The company to make active. Must be one the authenticated user is a member of.',
    example: 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab',
  })
  @IsUUID()
  companyId!: string;
}
