import { Module } from '@nestjs/common';
import { SportController } from './sport.controller.js';

@Module({
  controllers: [SportController],
})
export class SportModule {}
