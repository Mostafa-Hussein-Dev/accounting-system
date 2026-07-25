import { Module } from '@nestjs/common';
import { InvitationsService } from './invitations.service';
import { InvitationsController } from './invitations.controller';
import { CaslModule } from '../casl/casl.module';
import { MailerModule } from '../../common/mailer/mailer.module';

@Module({
  imports: [CaslModule, MailerModule],
  providers: [InvitationsService],
  controllers: [InvitationsController],
})
export class InvitationsModule {}
