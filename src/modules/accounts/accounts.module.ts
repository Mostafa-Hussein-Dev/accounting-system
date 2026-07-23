import { Module } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { AccountsController } from './accounts.controller';
import { CaslModule } from '../casl/casl.module';
import { GlModule } from '../gl/gl.module';

@Module({
  // GlModule supplies LedgerService for GET /accounts/:id/balance (derived from
  // the ledger). GlModule does not depend back on AccountsModule, so no cycle.
  imports: [CaslModule, GlModule],
  providers: [AccountsService],
  controllers: [AccountsController],
  exports: [AccountsService],
})
export class AccountsModule {}
