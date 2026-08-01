import { Module } from '@nestjs/common';
import { CaslModule } from '../casl/casl.module';
import { SequencesModule } from '../sequences/sequences.module';
import { StockModule } from '../stock/stock.module';
import { GlModule } from '../gl/gl.module';
import { PurchaseOrdersService } from './purchase-orders.service';
import { PurchaseOrdersController } from './purchase-orders.controller';
import { GoodsReceiptsService } from './goods-receipts.service';
import { GoodsReceiptsController } from './goods-receipts.controller';

@Module({
  imports: [CaslModule, SequencesModule, StockModule, GlModule],
  providers: [PurchaseOrdersService, GoodsReceiptsService],
  controllers: [PurchaseOrdersController, GoodsReceiptsController],
  exports: [PurchaseOrdersService, GoodsReceiptsService],
})
export class PurchasingModule {}
