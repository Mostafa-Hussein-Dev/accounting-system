import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateExchangeRateDto } from './create-exchange-rate.dto';

// companyId is omitted — a rate never moves between tenants. The common case
// for PATCH is correcting a mistyped rate value for the same day.
export class UpdateExchangeRateDto extends PartialType(
  OmitType(CreateExchangeRateDto, ['companyId'] as const),
) {}
