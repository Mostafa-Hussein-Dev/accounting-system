import { Module } from '@nestjs/common';
import { TaxesService } from './taxes.service';
import { TaxesController } from './taxes.controller';
import { CaslModule } from '../casl/casl.module';

@Module({
  imports: [CaslModule],
  providers: [TaxesService],
  controllers: [TaxesController],
  exports: [TaxesService],
})
export class TaxesModule {}
