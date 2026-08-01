import { Module } from '@nestjs/common';
import { CaslModule } from '../casl/casl.module';
import { SequencesModule } from '../sequences/sequences.module';
import { UomModule } from '../uom/uom.module';
import { LocationsService } from './locations.service';
import { LocationsController } from './locations.controller';
import { StockService } from './stock.service';
import { StockController, ItemStockController } from './stock.controller';

@Module({
  imports: [CaslModule, SequencesModule, UomModule],
  providers: [LocationsService, StockService],
  controllers: [LocationsController, StockController, ItemStockController],
  exports: [LocationsService, StockService],
})
export class StockModule {}
