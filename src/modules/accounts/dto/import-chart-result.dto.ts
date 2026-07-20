import { ApiProperty } from '@nestjs/swagger';

export class ImportChartResultDto {
  @ApiProperty({
    description:
      'Number of accounts created by this import (0 if all already existed).',
    example: 653,
  })
  imported!: number;
}
