import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateItemDto } from './create-item.dto';

// companyId is not updatable (an item never moves between companies).
export class UpdateItemDto extends PartialType(
  OmitType(CreateItemDto, ['companyId'] as const),
) {}
