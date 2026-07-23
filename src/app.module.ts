import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { CaslModule } from './modules/casl/casl.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { RolesModule } from './modules/roles/roles.module';
import { UsersModule } from './modules/users/users.module';
import { BranchesModule } from './modules/branches/branches.module';
import { CurrenciesModule } from './modules/currencies/currencies.module';
import { ExchangeRatesModule } from './modules/exchange-rates/exchange-rates.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { TaxesModule } from './modules/taxes/taxes.module';
import { SequencesModule } from './modules/sequences/sequences.module';
import { GlModule } from './modules/gl/gl.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    AuthModule,
    CaslModule,
    CompaniesModule,
    RolesModule,
    UsersModule,
    BranchesModule,
    CurrenciesModule,
    ExchangeRatesModule,
    AccountsModule,
    TaxesModule,
    SequencesModule,
    GlModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
