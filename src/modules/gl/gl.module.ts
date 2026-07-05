import { Module } from '@nestjs/common';
import { GlService } from './gl.service';
import { GlController } from './gl.controller';

@Module({
  providers: [GlService],
  controllers: [GlController],
})
export class GlModule {}
