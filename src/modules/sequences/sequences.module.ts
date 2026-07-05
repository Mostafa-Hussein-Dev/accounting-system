import { Module } from '@nestjs/common';
import { SequencesService } from './sequences.service';
import { SequencesController } from './sequences.controller';

@Module({
  providers: [SequencesService],
  controllers: [SequencesController],
})
export class SequencesModule {}
