import { Module } from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { CompaniesController } from './companies.controller';
import { CaslModule } from '../casl/casl.module';
import { AccountsModule } from '../accounts/accounts.module';
import { TaxesModule } from '../taxes/taxes.module';
import { SequencesModule } from '../sequences/sequences.module';
import { StockModule } from '../stock/stock.module';

@Module({
  // Accounts/Taxes/Sequences/Stock supply the seed services used by provision()
  // when a company is created (chart/VAT/document-numbering/virtual stock
  // locations). None of them import CompaniesModule, so there is no cycle.
  imports: [
    CaslModule,
    AccountsModule,
    TaxesModule,
    SequencesModule,
    StockModule,
  ],
  providers: [CompaniesService],
  controllers: [CompaniesController],
  exports: [CompaniesService],
})
export class CompaniesModule {}
