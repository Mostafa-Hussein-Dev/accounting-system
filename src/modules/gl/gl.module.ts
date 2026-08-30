import { Module } from '@nestjs/common';
import { GlService } from './gl.service';
import { PostingService } from './posting.service';
import { LedgerService } from './ledger.service';
import { JournalEntriesController } from './journal-entries.controller';
import { ReportsController } from './reports.controller';
import { CaslModule } from '../casl/casl.module';
import { SequencesModule } from '../sequences/sequences.module';
import { FiscalPeriodsModule } from '../fiscal-periods/fiscal-periods.module';

@Module({
  imports: [CaslModule, SequencesModule, FiscalPeriodsModule],
  providers: [GlService, PostingService, LedgerService],
  controllers: [JournalEntriesController, ReportsController],
  // Exported so AccountsModule can expose GET /accounts/:id/balance and future
  // document modules can call PostingService.post() to auto-post their entries.
  exports: [GlService, PostingService, LedgerService],
})
export class GlModule {}
