import { Module } from '@nestjs/common';
import { CaslModule } from '../casl/casl.module';
import { SequencesModule } from '../sequences/sequences.module';
import { FiscalPeriodsService } from './fiscal-periods.service';
import { FiscalPeriodsController } from './fiscal-periods.controller';

@Module({
  imports: [CaslModule, SequencesModule],
  providers: [FiscalPeriodsService],
  controllers: [FiscalPeriodsController],
  exports: [FiscalPeriodsService],
})
export class FiscalPeriodsModule {}
