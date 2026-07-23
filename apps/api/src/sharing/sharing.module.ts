import { Module } from '@nestjs/common';
import { StatisticsModule } from '../statistics/statistics.module.js';
import { SharingController } from './sharing.controller.js';
import { SharingService } from './sharing.service.js';

@Module({
  imports: [StatisticsModule],
  controllers: [SharingController],
  providers: [SharingService],
})
export class SharingModule {}
