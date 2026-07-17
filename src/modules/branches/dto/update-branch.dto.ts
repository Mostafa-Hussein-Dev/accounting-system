import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateBranchDto } from './create-branch.dto';

export class UpdateBranchDto extends PartialType(CreateBranchDto) {
  @ApiPropertyOptional({
    description: 'Deactivate a branch without deleting it (FR-102).',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
