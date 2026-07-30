import { Module } from '@nestjs/common';
import { ItemsService } from './items.service';
import { ItemsController } from './items.controller';
import { VariantsService } from './variants.service';
import { VariantsController } from './variants.controller';
import { BarcodesService } from './barcodes.service';
import {
  BarcodesController,
  BarcodeLookupController,
} from './barcodes.controller';
import { CaslModule } from '../casl/casl.module';

@Module({
  imports: [CaslModule],
  providers: [ItemsService, VariantsService, BarcodesService],
  controllers: [
    ItemsController,
    VariantsController,
    BarcodesController,
    BarcodeLookupController,
  ],
  exports: [ItemsService, VariantsService, BarcodesService],
})
export class ItemsModule {}
