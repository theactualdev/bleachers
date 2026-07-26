import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateMatchInput, UpdateMatchInput } from '@bleachers/types';
import { hasSportConfig } from '@bleachers/sport-engine';
import { PrismaService } from '../prisma/prisma.service.js';
import { MembershipService } from '../orgs/membership.service.js';
import { toLineup, toMatch, toTeam } from '../common/serialize.js';

@Injectable()
export class MatchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly members: MembershipService,
  ) {}

  /** Resolve a match's org and assert the caller holds at least `minRole` in it. */
  private async orgOf(matchId: string): Promise<string> {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: { organizationId: true },
    });
    if (!match) throw new NotFoundException('Match not found');
    return match.organizationId;
  }

  async list(userId: string, orgId: string) {
    await this.members.assertMember(userId, orgId, 'VIEWER');
    const matches = await this.prisma.match.findMany({
      where: { organizationId: orgId },
      orderBy: { scheduledAt: 'desc' },
      include: { homeTeam: true, awayTeam: true },
    });
    return matches.map((m) => ({
      ...toMatch(m),
      homeTeam: toTeam(m.homeTeam),
      awayTeam: toTeam(m.awayTeam),
    }));
  }

  async get(userId: string, id: string) {
    const match = await this.prisma.match.findUnique({
      where: { id },
      include: { homeTeam: true, awayTeam: true, lineups: true },
    });
    if (!match) throw new NotFoundException('Match not found');
    await this.members.assertMember(userId, match.organizationId, 'VIEWER');
    return {
      ...toMatch(match),
      homeTeam: toTeam(match.homeTeam),
      awayTeam: toTeam(match.awayTeam),
      lineups: match.lineups.map(toLineup),
    };
  }

  /**
   * Single-call, transactional match creation — the backbone of the "<30 second" flow.
   * Validates the sport is supported, teams exist, belong to the active org, and match the
   * sport, then persists the match and both lineups atomically.
   */
  async create(userId: string, orgId: string, input: CreateMatchInput) {
    await this.members.assertMember(userId, orgId, 'SCORER');

    if (!hasSportConfig(input.sport)) {
      throw new BadRequestException(`Sport "${input.sport}" is not supported yet`);
    }

    const [homeTeam, awayTeam] = await Promise.all([
      this.prisma.team.findUnique({ where: { id: input.homeTeamId } }),
      this.prisma.team.findUnique({ where: { id: input.awayTeamId } }),
    ]);
    if (!homeTeam || !awayTeam) throw new BadRequestException('Both teams must exist');
    if (homeTeam.organizationId !== orgId || awayTeam.organizationId !== orgId) {
      throw new BadRequestException('Both teams must belong to the active organization');
    }
    if (homeTeam.sport !== input.sport || awayTeam.sport !== input.sport) {
      throw new BadRequestException('Both teams must match the selected sport');
    }

    const lineupPlayerIds = [
      ...new Set([...input.homeLineup, ...input.awayLineup].map((l) => l.playerId)),
    ];
    if (lineupPlayerIds.length > 0) {
      const owned = await this.prisma.player.count({
        where: { id: { in: lineupPlayerIds }, organizationId: orgId },
      });
      if (owned !== lineupPlayerIds.length) {
        throw new BadRequestException('All lineup players must belong to the active organization');
      }
    }

    const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : new Date();

    const match = await this.prisma.$transaction(async (tx) => {
      const created = await tx.match.create({
        data: {
          sport: input.sport,
          homeTeamId: input.homeTeamId,
          awayTeamId: input.awayTeamId,
          venue: input.venue ?? null,
          scheduledAt,
          status: input.startNow ? 'LIVE' : 'SCHEDULED',
          statTier: input.statTier,
          competitionId: input.competitionId ?? null,
          organizationId: orgId,
          createdById: userId,
        },
      });

      const lineupRows = [
        ...input.homeLineup.map((l) => ({ ...l, side: 'HOME' as const })),
        ...input.awayLineup.map((l) => ({ ...l, side: 'AWAY' as const })),
      ];
      if (lineupRows.length > 0) {
        await tx.matchLineup.createMany({
          data: lineupRows.map((l) => ({
            matchId: created.id,
            side: l.side,
            playerId: l.playerId,
            isStarter: l.isStarter ?? true,
            jerseyNumberOverride: l.jerseyNumberOverride ?? null,
          })),
          skipDuplicates: true,
        });
      }

      return created;
    });

    return this.get(userId, match.id);
  }

  async update(userId: string, id: string, input: UpdateMatchInput) {
    await this.members.assertMember(userId, await this.orgOf(id), 'SCORER');
    const match = await this.prisma.match.update({
      where: { id },
      data: {
        ...(input.venue !== undefined ? { venue: input.venue } : {}),
        ...(input.scheduledAt !== undefined ? { scheduledAt: new Date(input.scheduledAt) } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.statTier !== undefined ? { statTier: input.statTier } : {}),
        ...(input.competitionId !== undefined ? { competitionId: input.competitionId } : {}),
      },
    });
    return toMatch(match);
  }

  /** Convenience transitions used by the live-scoring screen. */
  async setStatus(
    userId: string,
    id: string,
    status: 'LIVE' | 'PAUSED' | 'COMPLETED' | 'ABANDONED',
  ) {
    await this.members.assertMember(userId, await this.orgOf(id), 'SCORER');
    const match = await this.prisma.match.update({ where: { id }, data: { status } });
    return toMatch(match);
  }
}
