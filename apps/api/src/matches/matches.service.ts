import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateMatchInput, UpdateMatchInput } from '@bleachers/types';
import { hasSportConfig } from '@bleachers/sport-engine';
import { PrismaService } from '../prisma/prisma.service.js';
import { toLineup, toMatch, toTeam } from '../common/serialize.js';

@Injectable()
export class MatchesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    const matches = await this.prisma.match.findMany({
      where: { createdById: userId },
      orderBy: { scheduledAt: 'desc' },
      include: { homeTeam: true, awayTeam: true },
    });
    return matches.map((m) => ({
      ...toMatch(m),
      homeTeam: toTeam(m.homeTeam),
      awayTeam: toTeam(m.awayTeam),
    }));
  }

  async get(id: string) {
    const match = await this.prisma.match.findUnique({
      where: { id },
      include: { homeTeam: true, awayTeam: true, lineups: true },
    });
    if (!match) throw new NotFoundException('Match not found');
    return {
      ...toMatch(match),
      homeTeam: toTeam(match.homeTeam),
      awayTeam: toTeam(match.awayTeam),
      lineups: match.lineups.map(toLineup),
    };
  }

  /**
   * Single-call, transactional match creation — the backbone of the "<30 second" flow.
   * Validates the sport is supported, teams exist and match the sport, then persists the match
   * and both lineups atomically.
   */
  async create(userId: string, input: CreateMatchInput) {
    if (!hasSportConfig(input.sport)) {
      throw new BadRequestException(`Sport "${input.sport}" is not supported yet`);
    }

    const [homeTeam, awayTeam] = await Promise.all([
      this.prisma.team.findUnique({ where: { id: input.homeTeamId } }),
      this.prisma.team.findUnique({ where: { id: input.awayTeamId } }),
    ]);
    if (!homeTeam || !awayTeam) throw new BadRequestException('Both teams must exist');
    if (homeTeam.sport !== input.sport || awayTeam.sport !== input.sport) {
      throw new BadRequestException('Both teams must match the selected sport');
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

      // Owner grant for the creator.
      await tx.permissionGrant.create({
        data: { userId, role: 'OWNER', scope: 'MATCH', resourceId: created.id },
      });

      return created;
    });

    return this.get(match.id);
  }

  async update(id: string, input: UpdateMatchInput) {
    await this.get(id);
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
  async setStatus(id: string, status: 'LIVE' | 'PAUSED' | 'COMPLETED' | 'ABANDONED') {
    await this.get(id);
    const match = await this.prisma.match.update({ where: { id }, data: { status } });
    return toMatch(match);
  }
}
