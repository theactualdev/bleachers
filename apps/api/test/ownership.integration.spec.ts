import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { TeamsService } from '../src/teams/teams.service';
import { PlayersService } from '../src/players/players.service';
import { MembershipService } from '../src/orgs/membership.service';
import { createTestUser, deleteTestUser, getPersonalOrg } from './helpers/auth';

/**
 * Integration test against a real Postgres: teams/players are org-scoped resources.
 * A member of a different org — even one with no relationship to the resource's
 * org at all — must be rejected for both reads and writes (cross-org isolation),
 * while a member of the resource's own org (its OWNER, here) succeeds.
 */
describe('Cross-org isolation on teams/players (integration)', () => {
  const prisma = new PrismaService();
  const members = new MembershipService(prisma);
  const teams = new TeamsService(prisma, members);
  const players = new PlayersService(prisma, members);

  let ownerId = '';
  let intruderId = '';
  let ownerOrg = '';
  let intruderOrg = '';
  let homeTeamId = '';
  let awayTeamId = '';
  let playerId = '';

  beforeAll(async () => {
    await prisma.$connect();
    ownerId = await createTestUser();
    intruderId = await createTestUser();
    ownerOrg = await getPersonalOrg(ownerId);
    intruderOrg = await getPersonalOrg(intruderId);

    const home = await teams.create(ownerId, ownerOrg, {
      name: 'Own Home',
      colors: { primary: '#101010' },
      sport: 'FOOTBALL',
    });
    const away = await teams.create(ownerId, ownerOrg, {
      name: 'Own Away',
      colors: { primary: '#202020' },
      sport: 'FOOTBALL',
    });
    homeTeamId = home.id;
    awayTeamId = away.id;

    const player = await players.create(ownerId, ownerOrg, { name: 'Owned Player' });
    playerId = player.id;
  });

  afterAll(async () => {
    if (homeTeamId || awayTeamId) {
      const teamIds = [homeTeamId, awayTeamId].filter(Boolean);
      await prisma.rosterEntry.deleteMany({ where: { teamId: { in: teamIds } } });
      await prisma.team.deleteMany({ where: { id: { in: teamIds } } });
    }
    if (playerId) await prisma.player.deleteMany({ where: { id: playerId } });
    await prisma.$disconnect();
    await deleteTestUser(ownerId);
    await deleteTestUser(intruderId);
  });

  it('rejects an intruder reading a team, player, or roster from another org', async () => {
    await expect(teams.get(intruderId, homeTeamId)).rejects.toThrow(ForbiddenException);
    await expect(players.get(intruderId, playerId)).rejects.toThrow(ForbiddenException);
    await expect(teams.getRoster(intruderId, homeTeamId)).rejects.toThrow(ForbiddenException);
  });

  it('rejects an intruder updating a team or player from another org', async () => {
    await expect(teams.update(intruderId, homeTeamId, { name: 'Defaced' })).rejects.toThrow(
      ForbiddenException,
    );
    await expect(players.update(intruderId, playerId, { name: 'Vandalized' })).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rejects an intruder adding to or removing from a roster in another org', async () => {
    await expect(teams.addToRoster(intruderId, homeTeamId, { playerId })).rejects.toThrow(
      ForbiddenException,
    );
    await teams.addToRoster(ownerId, homeTeamId, { playerId });
    await expect(teams.removeFromRoster(intruderId, homeTeamId, playerId)).rejects.toThrow(
      ForbiddenException,
    );
    // Still on the roster afterwards.
    const roster = await teams.getRoster(ownerId, homeTeamId);
    expect(roster.some((r) => r.playerId === playerId)).toBe(true);
  });

  it('allows the org member (owner) to read the team, player, and roster', async () => {
    await expect(teams.get(ownerId, homeTeamId)).resolves.toMatchObject({ id: homeTeamId });
    await expect(players.get(ownerId, playerId)).resolves.toMatchObject({ id: playerId });
    await expect(teams.getRoster(ownerId, homeTeamId)).resolves.toBeInstanceOf(Array);
  });

  it('allows the org member (owner) to update the team and player', async () => {
    const updatedTeam = await teams.update(ownerId, homeTeamId, { name: 'Own Home FC' });
    expect(updatedTeam.name).toBe('Own Home FC');
    const updatedPlayer = await players.update(ownerId, playerId, { name: 'Owned Player Jr' });
    expect(updatedPlayer.name).toBe('Owned Player Jr');
  });

  it("rejects listing another org's teams/players", async () => {
    await expect(teams.list(ownerId, intruderOrg)).rejects.toThrow(ForbiddenException);
    await expect(players.list(ownerId, intruderOrg)).rejects.toThrow(ForbiddenException);
  });

  it("allows listing one's own org's teams/players", async () => {
    const teamList = await teams.list(ownerId, ownerOrg);
    expect(teamList.some((t) => t.id === homeTeamId)).toBe(true);
    const playerList = await players.list(ownerId, ownerOrg);
    expect(playerList.some((p) => p.id === playerId)).toBe(true);
  });

  it("creates land in the caller's org", async () => {
    const team = await teams.create(ownerId, ownerOrg, {
      name: 'Another Own Team',
      colors: { primary: '#303030' },
      sport: 'FOOTBALL',
    });
    expect(team.id).toBeTruthy();
    const row = await prisma.team.findUniqueOrThrow({ where: { id: team.id } });
    expect(row.organizationId).toBe(ownerOrg);
    await prisma.team.deleteMany({ where: { id: team.id } });
  });
});
