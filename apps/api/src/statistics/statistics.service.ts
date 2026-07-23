import { Injectable, NotFoundException } from '@nestjs/common';
import type { MatchStats, PlayerCareerStats, TeamStats } from '@bleachers/types';
import {
  aggregatePlayerCareer,
  computeTeamStats,
  getSportConfig,
  reduceMatch,
  type TeamMatchResult,
} from '@bleachers/sport-engine';
import type { Sport } from '@bleachers/types';
import { PrismaService } from '../prisma/prisma.service.js';
import { toEvent } from '../common/serialize.js';

@Injectable()
export class StatisticsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Derived match state — score, timeline, per-player and team stats. Never persisted. */
  async matchStats(matchId: string): Promise<MatchStats> {
    const match = await this.prisma.match.findUnique({ where: { id: matchId } });
    if (!match) throw new NotFoundException('Match not found');
    const events = await this.prisma.event.findMany({ where: { matchId, voided: false } });
    const config = getSportConfig(match.sport);
    return reduceMatch(config, matchId, events.map(toEvent), match.statTier);
  }

  /** Aggregate a player's career by folding all their events (single sport for Phase 1). */
  async playerCareer(playerId: string, sport: Sport = 'FOOTBALL'): Promise<PlayerCareerStats> {
    const player = await this.prisma.player.findUnique({ where: { id: playerId } });
    if (!player) throw new NotFoundException('Player not found');

    const config = getSportConfig(sport);
    const events = await this.prisma.event.findMany({
      where: { playerId, voided: false, match: { sport } },
    });

    const lineupMatches = await this.prisma.matchLineup.findMany({
      where: { playerId, match: { sport } },
      select: { matchId: true },
    });
    const appearanceIds = new Set<string>(lineupMatches.map((l) => l.matchId));
    for (const e of events) appearanceIds.add(e.matchId);

    return aggregatePlayerCareer(config, playerId, events.map(toEvent), appearanceIds.size);
  }

  /** Win/Draw/Loss, goals, and form for a team, derived from its completed matches. */
  async teamStats(teamId: string): Promise<TeamStats> {
    const team = await this.prisma.team.findUnique({ where: { id: teamId } });
    if (!team) throw new NotFoundException('Team not found');

    const matches = await this.prisma.match.findMany({
      where: {
        status: 'COMPLETED',
        OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
      },
      orderBy: { scheduledAt: 'desc' },
      include: { events: { where: { voided: false } } },
    });

    const config = getSportConfig(team.sport);
    const results: TeamMatchResult[] = matches.map((m) => {
      const stats = reduceMatch(config, m.id, m.events.map(toEvent), m.statTier);
      const isHome = m.homeTeamId === teamId;
      return {
        goalsFor: isHome ? stats.score[0] : stats.score[1],
        goalsAgainst: isHome ? stats.score[1] : stats.score[0],
      };
    });

    return computeTeamStats(teamId, results);
  }
}
