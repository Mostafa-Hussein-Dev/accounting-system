import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { CaslModule } from '../casl/casl.module';

@Module({
  // CaslModule provides CaslAbilityFactory for the PermissionsGuard now used on
  // the /users routes.
  imports: [CaslModule],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
