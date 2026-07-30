import { Module } from '@nestjs/common';
import { UomService } from './uom.service';
import { UomCategoriesController, UomsController } from './uom.controller';
import { CaslModule } from '../casl/casl.module';

@Module({
  imports: [CaslModule],
  providers: [UomService],
  controllers: [UomCategoriesController, UomsController],
  exports: [UomService],
})
export class UomModule {}
