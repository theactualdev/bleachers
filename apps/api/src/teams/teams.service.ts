import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  AddRosterEntryInput,
  CreateTeamInput,
  CreateTeamPlayerInput,
  RegisterTeamInput,
  UpdateTeamInput,
} from '@bleachers/types';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { MembershipService } from '../orgs/membership.service.js';
import { toPlayer, toRosterEntry, toTeam } from '../common/serialize.js';

@Injectable()
export class TeamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly members: MembershipService,
  ) {}

  /** Resolve a team's org and assert the caller holds at least `minRole` in it. */
  private async orgOf(teamId: string): Promise<string> {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: { organizationId: true },
    });
    if (!team) throw new NotFoundException('Team not found');
    return team.organizationId;
  }

  async list(userId: string, orgId: string) {
    await this.members.assertMember(userId, orgId, 'VIEWER');
    const teams = await this.prisma.team.findMany({
      where: { organizationId: orgId },
      orderBy: { name: 'asc' },
    });
    return teams.map(toTeam);
  }

  async get(userId: string, id: string) {
    const team = await this.prisma.team.findUnique({ where: { id } });
    if (!team) throw new NotFoundException('Team not found');
    await this.members.assertMember(userId, team.organizationId, 'VIEWER');
    return toTeam(team);
  }

  async create(userId: string, orgId: string, input: CreateTeamInput) {
    await this.members.assertMember(userId, orgId, 'SCORER');
    const team = await this.prisma.team.create({
      data: {
        name: input.name,
        colors: input.colors as unknown as Prisma.InputJsonValue,
        logo: input.logo ?? null,
        sport: input.sport,
        isAdHoc: input.isAdHoc ?? false,
        organizationId: orgId,
        createdById: userId,
      },
    });
    return toTeam(team);
  }

  /**
   * Composite registration: creates the team, its team-born players, and their
   * roster entries in one transaction. Players have no standalone existence
   * outside a team — they are always created as part of registering onto one.
   *
   * Player/roster ids are generated client-side and rows are batch-inserted so the
   * transaction does a constant number of round trips regardless of roster size
   * (up to 40) — sequential per-row round trips were blowing past Prisma's default
   * interactive-transaction timeout against the hosted DB's latency.
   */
  async register(userId: string, orgId: string, input: RegisterTeamInput) {
    await this.members.assertMember(userId, orgId, 'SCORER');
    const result = await this.prisma.$transaction(async (tx) => {
      const team = await tx.team.create({
        data: {
          name: input.name,
          colors: input.colors as unknown as Prisma.InputJsonValue,
          logo: input.logo ?? null,
          sport: 'FOOTBALL',
          organizationId: orgId,
          createdById: userId,
        },
      });

      if (input.players.length === 0) {
        return { team, roster: [] };
      }

      const rows = input.players.map((p) => ({ playerId: randomUUID(), input: p }));
      await tx.player.createMany({
        data: rows.map((r) => ({
          id: r.playerId,
          name: r.input.name,
          photo: r.input.photo ?? null,
          dateOfBirth: null,
          organizationId: orgId,
          createdById: userId,
        })),
      });
      await tx.rosterEntry.createMany({
        data: rows.map((r) => ({
          teamId: team.id,
          playerId: r.playerId,
          jerseyNumber: r.input.jerseyNumber ?? null,
        })),
      });
      const roster = await tx.rosterEntry.findMany({
        where: { teamId: team.id },
        include: { player: true },
        orderBy: { createdAt: 'asc' },
      });
      return { team, roster };
    });
    return {
      team: toTeam(result.team),
      roster: result.roster.map((e) => ({ ...toRosterEntry(e), player: toPlayer(e.player) })),
    };
  }

  /** Adds a team-born player: creates the player and its roster entry atomically. */
  async addPlayer(userId: string, teamId: string, input: CreateTeamPlayerInput) {
    const orgId = await this.orgOf(teamId);
    await this.members.assertMember(userId, orgId, 'SCORER');
    const entry = await this.prisma.$transaction(async (tx) => {
      const player = await tx.player.create({
        data: {
          name: input.name,
          photo: input.photo ?? null,
          dateOfBirth: null,
          organizationId: orgId,
          createdById: userId,
        },
      });
      return tx.rosterEntry.create({
        data: { teamId, playerId: player.id, jerseyNumber: input.jerseyNumber ?? null },
        include: { player: true },
      });
    });
    return { ...toRosterEntry(entry), player: toPlayer(entry.player) };
  }

  async update(userId: string, id: string, input: UpdateTeamInput) {
    await this.members.assertMember(userId, await this.orgOf(id), 'SCORER');
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

  async getRoster(userId: string, teamId: string) {
    await this.members.assertMember(userId, await this.orgOf(teamId), 'VIEWER');
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

  async addToRoster(userId: string, teamId: string, input: AddRosterEntryInput) {
    const orgId = await this.orgOf(teamId);
    await this.members.assertMember(userId, orgId, 'SCORER');
    const player = await this.prisma.player.findUnique({
      where: { id: input.playerId },
      select: { organizationId: true },
    });
    if (!player) throw new NotFoundException('Player not found');
    if (player.organizationId !== orgId) {
      throw new BadRequestException('Player must belong to the same organization');
    }
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

  async removeFromRoster(userId: string, teamId: string, playerId: string) {
    await this.members.assertMember(userId, await this.orgOf(teamId), 'SCORER');
    await this.prisma.rosterEntry.deleteMany({ where: { teamId, playerId } });
    return { removed: true };
  }
}
