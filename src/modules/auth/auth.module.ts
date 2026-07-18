import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAccessStrategy } from './strategies/jwt-access.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { UsersModule } from '../users/users.module';
import { CompaniesModule } from '../companies/companies.module';
import { AccountsModule } from '../accounts/accounts.module';
import { MailerModule } from '../../common/mailer/mailer.module';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({}),
    // Only consumed by the forgot/reset-password routes (@UseGuards(ThrottlerGuard)
    // there specifically) — not applied globally, so this doesn't change the
    // behavior of login/register/refresh.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 20 }]),
    UsersModule,
    CompaniesModule,
    AccountsModule,
    MailerModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAccessStrategy, JwtRefreshStrategy],
})
export class AuthModule {}
