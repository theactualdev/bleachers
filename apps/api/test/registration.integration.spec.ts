import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { TeamsService } from '../src/teams/teams.service';
import { MembershipService } from '../src/orgs/membership.service';
import { createTestUser, deleteTestUser, getPersonalOrg } from './helpers/auth';

/**
 * Composite team registration: a single call creates a team, its team-born
 * players, and their roster entries atomically. Players no longer have a
 * standalone creation path — they are always born onto a team.
 */
describe('Composite team registration (integration)', () => {
  const prisma = new PrismaService();
  const members = new MembershipService(prisma);
  const teams = new TeamsService(prisma, members);

  let ownerId = '';
  let intruderId = '';
  let ownerOrg = '';
  let intruderOrg = '';
  const teamIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
    ownerId = await createTestUser();
    intruderId = await createTestUser();
    ownerOrg = await getPersonalOrg(ownerId);
    intruderOrg = await getPersonalOrg(intruderId);
  });

  afterAll(async () => {
    if (teamIds.length) {
      await prisma.rosterEntry.deleteMany({ where: { teamId: { in: teamIds } } });
      await prisma.team.deleteMany({ where: { id: { in: teamIds } } });
    }
    await prisma.$disconnect();
    await deleteTestUser(ownerId);
    await deleteTestUser(intruderId);
  });

  it('registers a team with its roster in one call, org-stamped throughout', async () => {
    const result = await teams.register(ownerId, ownerOrg, {
      name: 'Sunday League FC',
      colors: { primary: '#112233' },
      players: [
        { name: 'Alice Striker', jerseyNumber: '9' },
        { name: 'Bob Keeper', jerseyNumber: '1' },
      ],
    });
    teamIds.push(result.team.id);

    expect(result.team.name).toBe('Sunday League FC');
    const row = await prisma.team.findUniqueOrThrow({ where: { id: result.team.id } });
    expect(row.organizationId).toBe(ownerOrg);

    expect(result.roster).toHaveLength(2);
    const jerseys = result.roster.map((r) => r.jerseyNumber).sort();
    expect(jerseys).toEqual(['1', '9']);
    for (const entry of result.roster) {
      expect(entry.teamId).toBe(result.team.id);
      const playerRow = await prisma.player.findUniqueOrThrow({ where: { id: entry.playerId } });
      expect(playerRow.organizationId).toBe(ownerOrg);
      expect(entry.player.id).toBe(entry.playerId);
    }
  });

  it('registers a team with an empty roster', async () => {
    const result = await teams.register(ownerId, ownerOrg, {
      name: 'Empty Roster FC',
      colors: { primary: '#445566' },
      players: [],
    });
    teamIds.push(result.team.id);
    expect(result.roster).toEqual([]);
  });

  it('adds a team-born player and roster entry atomically', async () => {
    const team = await teams.register(ownerId, ownerOrg, {
      name: 'Add Player FC',
      colors: { primary: '#778899' },
      players: [],
    });
    teamIds.push(team.team.id);

    const entry = await teams.addPlayer(ownerId, team.team.id, { name: 'Late Signing' });
    expect(entry.teamId).toBe(team.team.id);
    expect(entry.player.name).toBe('Late Signing');

    const playerRow = await prisma.player.findUniqueOrThrow({ where: { id: entry.playerId } });
    expect(playerRow.organizationId).toBe(ownerOrg);
    const rosterRow = await prisma.rosterEntry.findUniqueOrThrow({
      where: { teamId_playerId: { teamId: team.team.id, playerId: entry.playerId } },
    });
    expect(rosterRow.playerId).toBe(entry.playerId);
  });

  it('leaves no orphan player row when addPlayer targets a nonexistent team', async () => {
    const bogusTeamId = '00000000-0000-0000-0000-000000000000';
    const uniqueName = `Ghost Player ${Date.now()}`;
    await expect(teams.addPlayer(ownerId, bogusTeamId, { name: uniqueName })).rejects.toThrow(
      NotFoundException,
    );
    const orphan = await prisma.player.findFirst({ where: { name: uniqueName } });
    expect(orphan).toBeNull();
  });

  it('rejects registering a team into an org the caller does not belong to', async () => {
    await expect(
      teams.register(intruderId, ownerOrg, {
        name: 'Hostile Takeover FC',
        colors: { primary: '#990000' },
        players: [],
      }),
    ).rejects.toThrow(ForbiddenException);
  });
});
