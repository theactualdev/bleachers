import { describe, expect, it } from 'vitest';
import { toMatch } from '../src/common/serialize.js';

describe('toMatch', () => {
  it('serializes clock fields, ISO-encoding the running timestamp', () => {
    const started = new Date('2026-08-01T15:00:00.000Z');
    const m = toMatch({
      id: '9f883634-7013-4435-b948-ba5f26581c18',
      sport: 'FOOTBALL',
      homeTeamId: '11111111-1111-4111-8111-111111111111',
      awayTeamId: '22222222-2222-4222-8222-222222222222',
      venue: null,
      scheduledAt: started,
      status: 'LIVE',
      statTier: 'BASIC',
      competitionId: null,
      createdById: '33333333-3333-4333-8333-333333333333',
      organizationId: '44444444-4444-4444-8444-444444444444',
      createdAt: started,
      updatedAt: started,
      periodStartedAt: started,
      pausedElapsedMs: 60_000,
      currentPeriod: 2,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    expect(m.periodStartedAt).toBe('2026-08-01T15:00:00.000Z');
    expect(m.pausedElapsedMs).toBe(60_000);
    expect(m.currentPeriod).toBe(2);
  });

  it('serializes a stopped clock as null', () => {
    const now = new Date();
    const m = toMatch({
      id: '9f883634-7013-4435-b948-ba5f26581c18',
      sport: 'FOOTBALL',
      homeTeamId: '11111111-1111-4111-8111-111111111111',
      awayTeamId: '22222222-2222-4222-8222-222222222222',
      venue: null,
      scheduledAt: now,
      status: 'SCHEDULED',
      statTier: 'BASIC',
      competitionId: null,
      createdById: '33333333-3333-4333-8333-333333333333',
      organizationId: '44444444-4444-4444-8444-444444444444',
      createdAt: now,
      updatedAt: now,
      periodStartedAt: null,
      pausedElapsedMs: 0,
      currentPeriod: 1,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    expect(m.periodStartedAt).toBeNull();
    expect(m.currentPeriod).toBe(1);
  });
});
