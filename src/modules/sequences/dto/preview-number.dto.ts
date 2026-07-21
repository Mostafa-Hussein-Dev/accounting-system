import { ApiProperty } from '@nestjs/swagger';

export class PreviewNumberDto {
  @ApiProperty({
    description:
      'What the next document number would look like today, WITHOUT consuming it.',
    example: 'INV-2026-0001',
  })
  number!: string;
}
