import { Module } from '@nestjs/common';
import { CaslModule } from '../casl/casl.module';
import { SequencesModule } from '../sequences/sequences.module';
import { StockModule } from '../stock/stock.module';
import { GlModule } from '../gl/gl.module';
import { PurchaseOrdersService } from './purchase-orders.service';
import { PurchaseOrdersController } from './purchase-orders.controller';
import { GoodsReceiptsService } from './goods-receipts.service';
import { GoodsReceiptsController } from './goods-receipts.controller';
import { VendorBillsService } from './vendor-bills.service';
import { VendorBillsController } from './vendor-bills.controller';

@Module({
  imports: [CaslModule, SequencesModule, StockModule, GlModule],
  providers: [PurchaseOrdersService, GoodsReceiptsService, VendorBillsService],
  controllers: [
    PurchaseOrdersController,
    GoodsReceiptsController,
    VendorBillsController,
  ],
  exports: [PurchaseOrdersService, GoodsReceiptsService, VendorBillsService],
})
export class PurchasingModule {}
