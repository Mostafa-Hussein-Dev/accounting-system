import { Module } from '@nestjs/common';
import { CaslModule } from '../casl/casl.module';
import { SequencesModule } from '../sequences/sequences.module';
import { UomModule } from '../uom/uom.module';
import { FiscalPeriodsModule } from '../fiscal-periods/fiscal-periods.module';
import { LocationsService } from './locations.service';
import { LocationsController } from './locations.controller';
import { StockService } from './stock.service';
import { StockController, ItemStockController } from './stock.controller';
import { StockCountsService } from './stock-counts.service';
import { StockCountsController } from './stock-counts.controller';
import { StockTransfersService } from './stock-transfers.service';
import { StockTransfersController } from './stock-transfers.controller';

@Module({
  imports: [CaslModule, SequencesModule, UomModule, FiscalPeriodsModule],
  providers: [
    LocationsService,
    StockService,
    StockCountsService,
    StockTransfersService,
  ],
  controllers: [
    LocationsController,
    StockController,
    ItemStockController,
    StockCountsController,
    StockTransfersController,
  ],
  exports: [LocationsService, StockService],
})
export class StockModule {}
