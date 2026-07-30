import { Module } from '@nestjs/common';
import { ItemsService } from './items.service';
import { ItemsController } from './items.controller';
import { VariantsService } from './variants.service';
import { VariantsController } from './variants.controller';
import { CaslModule } from '../casl/casl.module';

@Module({
  imports: [CaslModule],
  providers: [ItemsService, VariantsService],
  controllers: [ItemsController, VariantsController],
  exports: [ItemsService, VariantsService],
})
export class ItemsModule {}
