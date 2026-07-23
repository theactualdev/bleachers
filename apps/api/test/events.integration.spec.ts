import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service';
import { EventsService } from '../src/events/events.service';
import { StatisticsService } from '../src/statistics/statistics.service';
import { MatchesService } from '../src/matches/matches.service';
import type { RealtimeGateway } from '../src/realtime/realtime.gateway';
import { createTestUser, deleteTestUser } from './helpers/auth';

/**
 * Integration test against a real Postgres (uses DATABASE_URL). Exercises the event-sourcing
 * write path and derived-statistics read path end to end, including idempotency and voiding.
 * Services are instantiated directly (no HTTP/auth) so the test targets domain logic.
 */
describe('Events + Statistics (integration)', () => {
  const prisma = new PrismaService();
  // RealtimeGateway is a broadcast side-effect; a no-op double keeps the test hermetic.
  const realtime = {
    broadcastEvent: () => {},
    broadcastVoid: () => {},
  } as unknown as RealtimeGateway;
  const events = new EventsService(prisma, realtime);
  const stats = new StatisticsService(prisma);
  const matches = new MatchesService(prisma);

  let userId = '';
  let homeTeamId = '';
  let awayTeamId = '';
  let p1 = '';
  let p2 = '';
  let matchId = '';

  beforeAll(async () => {
    await prisma.$connect();
    userId = await createTestUser();
    const home = await prisma.team.create({
      data: {
        name: 'Home',
        colors: { primary: '#111111' },
        sport: 'FOOTBALL',
        createdById: userId,
      },
    });
    const away = await prisma.team.create({
      data: {
        name: 'Away',
        colors: { primary: '#222222' },
        sport: 'FOOTBALL',
        createdById: userId,
      },
    });
    homeTeamId = home.id;
    awayTeamId = away.id;
    const pl1 = await prisma.player.create({ data: { name: 'One', createdById: userId } });
    const pl2 = await prisma.player.create({ data: { name: 'Two', createdById: userId } });
    p1 = pl1.id;
    p2 = pl2.id;

    const match = await matches.create(userId, {
      sport: 'FOOTBALL',
      homeTeamId,
      awayTeamId,
      statTier: 'BASIC',
      startNow: true,
      homeLineup: [{ playerId: p1, isStarter: true }],
      awayLineup: [{ playerId: p2, isStarter: true }],
    });
    matchId = match.id;
  });

  afterAll(async () => {
    await prisma.event.deleteMany({ where: { matchId } });
    await prisma.matchLineup.deleteMany({ where: { matchId } });
    await prisma.permissionGrant.deleteMany({ where: { userId } });
    await prisma.match.deleteMany({ where: { id: matchId } });
    await prisma.team.deleteMany({ where: { id: { in: [homeTeamId, awayTeamId] } } });
    await prisma.player.deleteMany({ where: { id: { in: [p1, p2] } } });
    await prisma.$disconnect();
    await deleteTestUser(userId);
  });

  it('records a goal and derives the score', async () => {
    await events.record(userId, {
      id: randomUUID(),
      matchId,
      type: 'goal',
      side: 'HOME',
      playerId: p1,
      period: 1,
      clockMs: 60000,
    });
    const s = await stats.matchStats(matchId);
    expect(s.score).toEqual([1, 0]);
  });

  it('is idempotent on the client-supplied id', async () => {
    const id = randomUUID();
    const first = await events.record(userId, {
      id,
      matchId,
      type: 'goal',
      side: 'AWAY',
      playerId: p2,
      period: 1,
      clockMs: 70000,
    });
    const second = await events.record(userId, {
      id,
      matchId,
      type: 'goal',
      side: 'AWAY',
      playerId: p2,
      period: 1,
      clockMs: 70000,
    });
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    const s = await stats.matchStats(matchId);
    expect(s.score).toEqual([1, 1]); // not double-counted
  });

  it('voids (undoes) the last event without deleting it', async () => {
    const before = await prisma.event.count({ where: { matchId } });
    await events.undoLast(userId, matchId);
    const after = await prisma.event.count({ where: { matchId } });
    expect(after).toBe(before); // nothing deleted
    const voided = await prisma.event.count({ where: { matchId, voided: true } });
    expect(voided).toBe(1);
    const s = await stats.matchStats(matchId);
    expect(s.score).toEqual([1, 0]); // away goal voided
  });

  it('batch-uploads with idempotent replay', async () => {
    const newId = randomUUID();
    const existing = await prisma.event.findFirst({ where: { matchId, voided: false } });
    const result = await events.batchUpload(userId, {
      matchId,
      events: [
        {
          id: newId,
          matchId,
          type: 'goal',
          side: 'AWAY',
          playerId: p2,
          period: 2,
          clockMs: 100000,
        },
        // Replay an event already stored → should be reported as a duplicate.
        {
          id: existing!.id,
          matchId,
          type: existing!.type,
          side: existing!.side,
          period: existing!.period,
          clockMs: existing!.clockMs,
        },
      ],
    });
    expect(result.accepted).toContain(newId);
    expect(result.duplicates).toContain(existing!.id);
    const s = await stats.matchStats(matchId);
    expect(s.score).toEqual([1, 1]);
  });

  it('rejects advanced event types in a BASIC match', async () => {
    await expect(
      events.record(userId, {
        id: randomUUID(),
        matchId,
        type: 'interception', // advanced-only
        side: 'HOME',
        playerId: p1,
        period: 1,
        clockMs: 80000,
      }),
    ).rejects.toThrow();
  });

  it('aggregates player career totals across the match', async () => {
    const career = await stats.playerCareer(p1, 'FOOTBALL');
    expect(career.appearances).toBeGreaterThanOrEqual(1);
    expect(career.totals.find((t) => t.key === 'goal')?.value).toBe(1);
  });
});
