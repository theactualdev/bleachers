import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { SportSchema, type Sport } from '@bleachers/types';
import { StatisticsService } from './statistics.service.js';

@Controller()
export class StatisticsController {
  constructor(private readonly stats: StatisticsService) {}

  @Get('matches/:id/stats')
  matchStats(@Param('id', ParseUUIDPipe) id: string) {
    return this.stats.matchStats(id);
  }

  @Get('players/:id/career')
  playerCareer(@Param('id', ParseUUIDPipe) id: string, @Query('sport') sport?: string) {
    const parsed: Sport = SportSchema.catch('FOOTBALL').parse(sport);
    return this.stats.playerCareer(id, parsed);
  }

  @Get('teams/:id/stats')
  teamStats(@Param('id', ParseUUIDPipe) id: string) {
    return this.stats.teamStats(id);
  }
}
