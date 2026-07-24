import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { MatchesService } from '../src/matches/matches.service';
import { TeamsService } from '../src/teams/teams.service';
import { PlayersService } from '../src/players/players.service';
import { createTestUser, deleteTestUser } from './helpers/auth';

/**
 * Integration test against a real Postgres: mutations must be rejected for any
 * authenticated user who does not own the resource (write-path IDOR guard).
 */
describe('Ownership enforcement on mutations (integration)', () => {
  const prisma = new PrismaService();
  const matches = new MatchesService(prisma);
  const teams = new TeamsService(prisma);
  const players = new PlayersService(prisma);

  let ownerId = '';
  let intruderId = '';
  let homeTeamId = '';
  let awayTeamId = '';
  let playerId = '';
  let matchId = '';

  beforeAll(async () => {
    await prisma.$connect();
    ownerId = await createTestUser();
    intruderId = await createTestUser();

    const home = await teams.create(ownerId, {
      name: 'Own Home',
      colors: { primary: '#101010' },
      sport: 'FOOTBALL',
    });
    const away = await teams.create(ownerId, {
      name: 'Own Away',
      colors: { primary: '#202020' },
      sport: 'FOOTBALL',
    });
    homeTeamId = home.id;
    awayTeamId = away.id;

    const player = await players.create(ownerId, { name: 'Owned Player' });
    playerId = player.id;

    const match = await matches.create(ownerId, {
      sport: 'FOOTBALL',
      homeTeamId,
      awayTeamId,
      statTier: 'BASIC',
      startNow: false,
      homeLineup: [],
      awayLineup: [],
    });
    matchId = match.id;
  });

  afterAll(async () => {
    // If beforeAll failed before creating anything, skip cleanup of never-created rows.
    if (matchId) {
      await prisma.permissionGrant.deleteMany({ where: { resourceId: matchId } });
      await prisma.match.deleteMany({ where: { id: matchId } });
    }
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

  it('rejects a non-owner updating a match', async () => {
    await expect(matches.update(intruderId, matchId, { venue: 'Hijacked' })).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('allows the owner to update their match', async () => {
    const updated = await matches.update(ownerId, matchId, { venue: 'Legit Park' });
    expect(updated.venue).toBe('Legit Park');
  });

  it('rejects a non-owner updating a team', async () => {
    await expect(teams.update(intruderId, homeTeamId, { name: 'Defaced' })).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('allows the owner to update their team', async () => {
    const updated = await teams.update(ownerId, homeTeamId, { name: 'Own Home FC' });
    expect(updated.name).toBe('Own Home FC');
  });

  it('rejects a non-owner adding to a roster', async () => {
    await expect(teams.addToRoster(intruderId, homeTeamId, { playerId })).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rejects a non-owner removing from a roster', async () => {
    await teams.addToRoster(ownerId, homeTeamId, { playerId });
    await expect(teams.removeFromRoster(intruderId, homeTeamId, playerId)).rejects.toThrow(
      ForbiddenException,
    );
    // Still on the roster afterwards.
    const roster = await teams.getRoster(homeTeamId);
    expect(roster.some((r) => r.playerId === playerId)).toBe(true);
  });

  it('rejects a non-owner updating a player', async () => {
    await expect(players.update(intruderId, playerId, { name: 'Vandalized' })).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('allows the owner to update their player', async () => {
    const updated = await players.update(ownerId, playerId, { name: 'Owned Player Jr' });
    expect(updated.name).toBe('Owned Player Jr');
  });
});
