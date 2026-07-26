import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { SportSchema, type Sport } from '@bleachers/types';
import { CurrentUser } from '../auth/auth.decorators.js';
import type { AuthUser } from '../auth/auth.types.js';
import { StatisticsService } from './statistics.service.js';

@Controller()
export class StatisticsController {
  constructor(private readonly stats: StatisticsService) {}

  @Get('matches/:id/stats')
  matchStats(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.stats.matchStats(user.id, id);
  }

  @Get('players/:id/career')
  playerCareer(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('sport') sport?: string,
  ) {
    const parsed: Sport = SportSchema.catch('FOOTBALL').parse(sport);
    return this.stats.playerCareer(user.id, id, parsed);
  }

  @Get('teams/:id/stats')
  teamStats(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.stats.teamStats(user.id, id);
  }
}
