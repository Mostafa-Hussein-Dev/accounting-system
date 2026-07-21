import { Module } from '@nestjs/common';
import { SequencesService } from './sequences.service';
import { SequencesController } from './sequences.controller';
import { CaslModule } from '../casl/casl.module';

@Module({
  imports: [CaslModule],
  providers: [SequencesService],
  controllers: [SequencesController],
  exports: [SequencesService],
})
export class SequencesModule {}
