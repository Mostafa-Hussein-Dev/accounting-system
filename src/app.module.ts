import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [ConfigModule, PrismaModule, CompaniesModule, UsersModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
