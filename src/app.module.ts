import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CompaniesModule } from './companies/companies.module';
import { BranchesModule } from './branches/branches.module';
import { CurrenciesModule } from './currencies/currencies.module';
import { AccountsModule } from './accounts/accounts.module';
import { PartnersModule } from './partners/partners.module';
import { ItemsModule } from './items/items.module';
import { StockModule } from './stock/stock.module';
import { PurchasingModule } from './purchasing/purchasing.module';
import { SalesModule } from './sales/sales.module';
import { PaymentsModule } from './payments/payments.module';
import { AccountingModule } from './accounting/accounting.module';
import { TaxesModule } from './taxes/taxes.module';
import { SequencesModule } from './sequences/sequences.module';
import { ReportsModule } from './reports/reports.module';
import { AuditModule } from './audit/audit.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AuthModule, UsersModule, CompaniesModule, BranchesModule, CurrenciesModule, AccountsModule, PartnersModule, ItemsModule, StockModule, PurchasingModule, SalesModule, PaymentsModule, AccountingModule, TaxesModule, SequencesModule, ReportsModule, AuditModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
