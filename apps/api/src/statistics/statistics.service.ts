import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  MatchStats,
  PlayerCareerStats,
  PlayerMatchLogEntry,
  TeamStats,
} from '@bleachers/types';
import {
  aggregatePlayerCareer,
  computeTeamStats,
  getSportConfig,
  reduceMatch,
  type TeamMatchResult,
} from '@bleachers/sport-engine';
import type { Sport } from '@bleachers/types';
import { PrismaService } from '../prisma/prisma.service.js';
import { MembershipService } from '../orgs/membership.service.js';
import { toEvent } from '../common/serialize.js';

@Injectable()
export class StatisticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly members: MembershipService,
  ) {}

  /** Derived match state — score, timeline, per-player and team stats. Never persisted. */
  async matchStatsCore(matchId: string): Promise<MatchStats> {
    const match = await this.prisma.match.findUnique({ where: { id: matchId } });
    if (!match) throw new NotFoundException('Match not found');
    const events = await this.prisma.event.findMany({ where: { matchId, voided: false } });
    const config = getSportConfig(match.sport);
    return reduceMatch(config, matchId, events.map(toEvent), match.statTier);
  }

  async matchStats(userId: string, matchId: string): Promise<MatchStats> {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: { organizationId: true },
    });
    if (!match) throw new NotFoundException('Match not found');
    await this.members.assertMember(userId, match.organizationId, 'VIEWER');
    return this.matchStatsCore(matchId);
  }

  /** Aggregate a player's career by folding all their events (single sport for Phase 1). */
  async playerCareerCore(playerId: string, sport: Sport = 'FOOTBALL'): Promise<PlayerCareerStats> {
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

  async playerCareer(
    userId: string,
    playerId: string,
    sport: Sport = 'FOOTBALL',
  ): Promise<PlayerCareerStats> {
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
      select: { organizationId: true },
    });
    if (!player) throw new NotFoundException('Player not found');
    await this.members.assertMember(userId, player.organizationId, 'VIEWER');
    return this.playerCareerCore(playerId, sport);
  }

  /**
   * Per-match log for a player — the matches behind the career totals.
   *
   * A player counts as involved if they were named in the lineup OR recorded an
   * event, so a substitute nobody listed still appears through their goal.
   */
  async playerMatches(
    userId: string,
    playerId: string,
    sport: Sport = 'FOOTBALL',
  ): Promise<PlayerMatchLogEntry[]> {
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
      select: { organizationId: true },
    });
    if (!player) throw new NotFoundException('Player not found');
    await this.members.assertMember(userId, player.organizationId, 'VIEWER');

    const matches = await this.prisma.match.findMany({
      where: {
        sport,
        OR: [{ lineups: { some: { playerId } } }, { events: { some: { playerId } } }],
      },
      orderBy: { scheduledAt: 'desc' },
      include: {
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
        lineups: { where: { playerId }, select: { side: true } },
        events: { where: { voided: false } },
      },
    });

    const config = getSportConfig(sport);

    return matches.map((m) => {
      const stats = reduceMatch(config, m.id, m.events.map(toEvent), m.statTier);
      // Prefer the lineup's side; fall back to the side of this player's events.
      const side =
        m.lineups[0]?.side ?? m.events.find((e) => e.playerId === playerId)?.side ?? 'HOME';
      const isHome = side === 'HOME';
      const score: [number, number] = isHome
        ? [stats.score[0], stats.score[1]]
        : [stats.score[1], stats.score[0]];
      const result =
        m.status === 'COMPLETED'
          ? score[0] > score[1]
            ? ('W' as const)
            : score[0] < score[1]
              ? ('L' as const)
              : ('D' as const)
          : null;

      return {
        matchId: m.id,
        scheduledAt: m.scheduledAt.toISOString(),
        status: m.status,
        side,
        opponentName: isHome ? m.awayTeam.name : m.homeTeam.name,
        score,
        result,
        stats: stats.players.find((p) => p.playerId === playerId)?.stats ?? [],
      };
    });
  }

  /** Win/Draw/Loss, goals, and form for a team, derived from its completed matches. */
  async teamStatsCore(teamId: string): Promise<TeamStats> {
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

  async teamStats(userId: string, teamId: string): Promise<TeamStats> {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: { organizationId: true },
    });
    if (!team) throw new NotFoundException('Team not found');
    await this.members.assertMember(userId, team.organizationId, 'VIEWER');
    return this.teamStatsCore(teamId);
  }
}
