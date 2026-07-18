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
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
