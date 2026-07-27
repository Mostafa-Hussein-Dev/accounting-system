import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditService } from './audit.service';
import { AuditInterceptor } from './audit.interceptor';
import { AuditController } from './audit.controller';
import { CaslModule } from '../casl/casl.module';

/**
 * Cross-cutting audit trail (FR-1102). Global so any service (GL posting, auth
 * login, future document modules) can inject AuditService for rich domain
 * events without importing this module, and so the AuditInterceptor is bound
 * app-wide via APP_INTERCEPTOR.
 */
@Global()
@Module({
  imports: [CaslModule],
  controllers: [AuditController],
  providers: [
    AuditService,
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
  exports: [AuditService],
})
export class AuditModule {}
