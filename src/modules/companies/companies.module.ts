import { Module } from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { CompaniesController } from './companies.controller';
import { CaslModule } from '../casl/casl.module';

@Module({
  imports: [CaslModule],
  providers: [CompaniesService],
  controllers: [CompaniesController],
  exports: [CompaniesService],
})
export class CompaniesModule {}
