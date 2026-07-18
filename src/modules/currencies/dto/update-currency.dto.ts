import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateCurrencyDto } from './create-currency.dto';

// `code` is the immutable identity (primary key / route param) — it is never
// updatable, so it is omitted before the fields are made optional.
export class UpdateCurrencyDto extends PartialType(
  OmitType(CreateCurrencyDto, ['code'] as const),
) {}
