import { Module } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import {
  BrandsController,
  ColoursController,
  FamiliesController,
  ItemCategoriesController,
  SizesController,
} from './catalog.controller';
import { CaslModule } from '../casl/casl.module';

@Module({
  imports: [CaslModule],
  providers: [CatalogService],
  controllers: [
    BrandsController,
    FamiliesController,
    SizesController,
    ColoursController,
    ItemCategoriesController,
  ],
  exports: [CatalogService],
})
export class CatalogModule {}
