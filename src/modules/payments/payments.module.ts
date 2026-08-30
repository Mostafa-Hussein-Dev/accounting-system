import { Module } from '@nestjs/common';
import { CaslModule } from '../casl/casl.module';
import { SequencesModule } from '../sequences/sequences.module';
import { GlModule } from '../gl/gl.module';
import { FiscalPeriodsModule } from '../fiscal-periods/fiscal-periods.module';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';

@Module({
  imports: [CaslModule, SequencesModule, GlModule, FiscalPeriodsModule],
  providers: [PaymentsService],
  controllers: [PaymentsController],
  exports: [PaymentsService],
})
export class PaymentsModule {}
