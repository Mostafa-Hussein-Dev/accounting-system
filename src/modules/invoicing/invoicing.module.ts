import { Module } from '@nestjs/common';
import { CaslModule } from '../casl/casl.module';
import { SequencesModule } from '../sequences/sequences.module';
import { StockModule } from '../stock/stock.module';
import { SalesInvoicesService } from './sales-invoices.service';
import { SalesInvoicesController } from './sales-invoices.controller';
import { CreditNotesService } from './credit-notes.service';
import { CreditNotesController } from './credit-notes.controller';

@Module({
  imports: [CaslModule, SequencesModule, StockModule],
  providers: [SalesInvoicesService, CreditNotesService],
  controllers: [SalesInvoicesController, CreditNotesController],
  exports: [SalesInvoicesService, CreditNotesService],
})
export class InvoicingModule {}
