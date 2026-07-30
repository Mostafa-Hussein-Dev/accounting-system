import { Module } from '@nestjs/common';
import { PricingService } from './pricing.service';
import {
  ItemPriceController,
  PricelistsController,
} from './pricing.controller';
import { CaslModule } from '../casl/casl.module';

@Module({
  imports: [CaslModule],
  providers: [PricingService],
  controllers: [PricelistsController, ItemPriceController],
  exports: [PricingService],
})
export class PricingModule {}
