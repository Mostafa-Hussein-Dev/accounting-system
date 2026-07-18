import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateAccountDto } from './create-account.dto';

// companyId is omitted — an account never moves between tenants. All other
// fields (including parentId, to re-parent) are optional on update.
export class UpdateAccountDto extends PartialType(
  OmitType(CreateAccountDto, ['companyId'] as const),
) {}
