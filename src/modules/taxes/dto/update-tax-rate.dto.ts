import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateTaxRateDto } from './create-tax-rate.dto';

export class UpdateTaxRateDto extends PartialType(CreateTaxRateDto) {
  @ApiPropertyOptional({
    description: 'Deactivate a rate without deleting it.',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
