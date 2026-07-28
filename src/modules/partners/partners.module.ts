import { Module } from '@nestjs/common';
import { PartnersService } from './partners.service';
import { PartnersController } from './partners.controller';
import { StatementExportService } from './statement-export.service';
import { CaslModule } from '../casl/casl.module';

@Module({
  imports: [CaslModule],
  providers: [PartnersService, StatementExportService],
  controllers: [PartnersController],
  exports: [PartnersService],
})
export class PartnersModule {}
