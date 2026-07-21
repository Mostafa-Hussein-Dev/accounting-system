import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateDocumentSequenceDto } from './create-document-sequence.dto';

export class UpdateDocumentSequenceDto extends PartialType(
  CreateDocumentSequenceDto,
) {
  @ApiPropertyOptional({
    description: 'Deactivate a series without deleting it.',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
