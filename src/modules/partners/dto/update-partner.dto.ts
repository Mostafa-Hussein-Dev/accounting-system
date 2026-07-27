import { PartialType, OmitType } from '@nestjs/swagger';
import { CreatePartnerDto } from './create-partner.dto';

/**
 * Every field optional for a partial update. companyId is not updatable (a
 * partner never moves between companies), so it's omitted. Supplying `addresses`
 * replaces the whole set; omitting it leaves existing addresses untouched.
 */
export class UpdatePartnerDto extends PartialType(
  OmitType(CreatePartnerDto, ['companyId'] as const),
) {}
