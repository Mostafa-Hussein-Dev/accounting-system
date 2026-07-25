import { Module } from '@nestjs/common';
import { PermissionsService } from './permissions.service';
import { PermissionsController } from './permissions.controller';
import { CaslModule } from '../casl/casl.module';

@Module({
  imports: [CaslModule],
  providers: [PermissionsService],
  controllers: [PermissionsController],
})
export class PermissionsModule {}
