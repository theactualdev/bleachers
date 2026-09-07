import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateCompetitionInput,
  StandingsEntry,
  TopScorer,
  UpdateCompetitionInput,
} from '@bleachers/types';
import { computeStandings, getSportConfig, reduceMatch } from '@bleachers/sport-engine';
import { PrismaService } from '../prisma/prisma.service.js';
import { MembershipService } from '../orgs/membership.service.js';
import { toCompetition, toEvent } from '../common/serialize.js';

@Injectable()
export class CompetitionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly members: MembershipService,
  ) {}

  /** The competition's org, for authorising by id alone. */
  private async orgOf(id: string): Promise<string> {
    const c = await this.prisma.competition.findUnique({
      where: { id },
      select: { organizationId: true },
    });
    if (!c) throw new NotFoundException('Competition not found');
    return c.organizationId;
  }

  async list(userId: string, orgId: string) {
    await this.members.assertMember(userId, orgId, 'VIEWER');
    const rows = await this.prisma.competition.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toCompetition);
  }

  async get(userId: string, id: string) {
    await this.members.assertMember(userId, await this.orgOf(id), 'VIEWER');
    const c = await this.prisma.competition.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Competition not found');
    return toCompetition(c);
  }

  async create(userId: string, orgId: string, input: CreateCompetitionInput) {
    await this.members.assertMember(userId, orgId, 'SCORER');
    const c = await this.prisma.competition.create({
      data: {
        name: input.name,
        sport: input.sport,
        format: input.format,
        createdById: userId,
        organizationId: orgId,
      },
    });
    return toCompetition(c);
  }

  async update(userId: string, id: string, input: UpdateCompetitionInput) {
    await this.members.assertMember(userId, await this.orgOf(id), 'SCORER');
    const c = await this.prisma.competition.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.format !== undefined ? { format: input.format } : {}),
      },
    });
    return toCompetition(c);
  }

  /**
   * League table, derived from this competition's COMPLETED matches only.
   * An in-progress match has no result to contribute.
   */
  async standings(userId: string, id: string): Promise<StandingsEntry[]> {
    await this.members.assertMember(userId, await this.orgOf(id), 'VIEWER');

    const matches = await this.prisma.match.findMany({
      where: { competitionId: id, status: 'COMPLETED' },
      include: {
        homeTeam: { select: { id: true, name: true } },
        awayTeam: { select: { id: true, name: true } },
        events: { where: { voided: false } },
      },
    });

    const names = new Map<string, string>();
    const results = matches.map((m) => {
      const config = getSportConfig(m.sport);
      const stats = reduceMatch(config, m.id, m.events.map(toEvent), m.statTier);
      names.set(m.homeTeam.id, m.homeTeam.name);
      names.set(m.awayTeam.id, m.awayTeam.name);
      return {
        homeTeamId: m.homeTeamId,
        awayTeamId: m.awayTeamId,
        homeGoals: stats.score[0],
        awayGoals: stats.score[1],
      };
    });

    return computeStandings(results).map((row) => ({
      ...row,
      teamName: names.get(row.teamId) ?? 'Team',
    }));
  }

  /**
   * Scorers across the competition. Scoring events are whatever the sport config
   * marks as scoring — the same judgement the timeline uses — so this stays
   * correct for sports where a score is not one goal.
   */
  async topScorers(userId: string, id: string): Promise<TopScorer[]> {
    await this.members.assertMember(userId, await this.orgOf(id), 'VIEWER');

    const matches = await this.prisma.match.findMany({
      where: { competitionId: id, status: 'COMPLETED' },
      include: { events: { where: { voided: false } } },
    });

    const goals = new Map<string, number>();
    for (const m of matches) {
      const config = getSportConfig(m.sport);
      const stats = reduceMatch(config, m.id, m.events.map(toEvent), m.statTier);
      for (const entry of stats.timeline) {
        if (!entry.isScoring || !entry.playerId) continue;
        goals.set(entry.playerId, (goals.get(entry.playerId) ?? 0) + 1);
      }
    }
    if (goals.size === 0) return [];

    const players = await this.prisma.player.findMany({
      where: { id: { in: [...goals.keys()] } },
      select: { id: true, name: true },
    });
    const names = new Map(players.map((p) => [p.id, p.name]));

    return [...goals.entries()]
      .map(([playerId, count]) => ({
        playerId,
        playerName: names.get(playerId) ?? 'Player',
        goals: count,
      }))
      .sort((a, b) => b.goals - a.goals || a.playerName.localeCompare(b.playerName));
  }
}
