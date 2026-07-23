import { Injectable, NotFoundException } from '@nestjs/common';
import type { AddRosterEntryInput, CreateTeamInput, UpdateTeamInput } from '@bleachers/types';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { toPlayer, toRosterEntry, toTeam } from '../common/serialize.js';

@Injectable()
export class TeamsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    const teams = await this.prisma.team.findMany({
      where: { createdById: userId },
      orderBy: { name: 'asc' },
    });
    return teams.map(toTeam);
  }

  async get(id: string) {
    const team = await this.prisma.team.findUnique({ where: { id } });
    if (!team) throw new NotFoundException('Team not found');
    return toTeam(team);
  }

  async create(userId: string, input: CreateTeamInput) {
    const team = await this.prisma.team.create({
      data: {
        name: input.name,
        colors: input.colors as unknown as Prisma.InputJsonValue,
        logo: input.logo ?? null,
        sport: input.sport,
        isAdHoc: input.isAdHoc ?? false,
        createdById: userId,
      },
    });
    return toTeam(team);
  }

  async update(id: string, input: UpdateTeamInput) {
    await this.get(id);
    const team = await this.prisma.team.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.colors !== undefined
          ? { colors: input.colors as unknown as Prisma.InputJsonValue }
          : {}),
        ...(input.logo !== undefined ? { logo: input.logo } : {}),
        ...(input.sport !== undefined ? { sport: input.sport } : {}),
        ...(input.isAdHoc !== undefined ? { isAdHoc: input.isAdHoc } : {}),
      },
    });
    return toTeam(team);
  }

  async getRoster(teamId: string) {
    await this.get(teamId);
    const entries = await this.prisma.rosterEntry.findMany({
      where: { teamId },
      include: { player: true },
      orderBy: { jerseyNumber: 'asc' },
    });
    return entries.map((e) => ({
      ...toRosterEntry(e),
      player: toPlayer(e.player),
    }));
  }

  async addToRoster(teamId: string, input: AddRosterEntryInput) {
    await this.get(teamId);
    const entry = await this.prisma.rosterEntry.upsert({
      where: { teamId_playerId: { teamId, playerId: input.playerId } },
      create: {
        teamId,
        playerId: input.playerId,
        jerseyNumber: input.jerseyNumber ?? null,
      },
      update: { jerseyNumber: input.jerseyNumber ?? null },
      include: { player: true },
    });
    return { ...toRosterEntry(entry), player: toPlayer(entry.player) };
  }

  async removeFromRoster(teamId: string, playerId: string) {
    await this.prisma.rosterEntry.deleteMany({ where: { teamId, playerId } });
    return { removed: true };
  }
}
