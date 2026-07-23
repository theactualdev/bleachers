import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { PlayersModule } from './players/players.module.js';
import { TeamsModule } from './teams/teams.module.js';
import { MatchesModule } from './matches/matches.module.js';
import { EventsModule } from './events/events.module.js';
import { StatisticsModule } from './statistics/statistics.module.js';
import { SharingModule } from './sharing/sharing.module.js';
import { RealtimeModule } from './realtime/realtime.module.js';
import { SportModule } from './sport/sport.module.js';
import { HealthController } from './health.controller.js';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    PlayersModule,
    TeamsModule,
    MatchesModule,
    EventsModule,
    StatisticsModule,
    SharingModule,
    RealtimeModule,
    SportModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
