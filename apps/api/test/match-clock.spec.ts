import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MatchesService } from '../src/matches/matches.service.js';

function makeMatch(overrides: Record<string, unknown> = {}) {
  const now = new Date();
  return {
    id: '9f883634-7013-4435-b948-ba5f26581c18',
    sport: 'FOOTBALL',
    homeTeamId: '11111111-1111-4111-8111-111111111111',
    awayTeamId: '22222222-2222-4222-8222-222222222222',
    venue: null,
    scheduledAt: now,
    status: 'SCHEDULED',
    statTier: 'BASIC',
    competitionId: null,
    createdById: 'u1',
    organizationId: 'org1',
    createdAt: now,
    updatedAt: now,
    periodStartedAt: null,
    pausedElapsedMs: 0,
    currentPeriod: 1,
    ...overrides,
  };
}

describe('MatchesService.clock', () => {
  let stored: ReturnType<typeof makeMatch>;
  let service: MatchesService;

  beforeEach(() => {
    stored = makeMatch();
    const prisma = {
      match: {
        findUnique: vi.fn(async () => stored),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          stored = { ...stored, ...data };
          return stored;
        }),
      },
    };
    const members = { assertMember: vi.fn(async () => undefined) };
    // Constructor deps beyond prisma/members are not exercised by clock().
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new MatchesService(prisma as any, members as any);
  });

  it('KICKOFF flips SCHEDULED to LIVE with a running clock', async () => {
    const m = await service.clock('u1', stored.id, { action: 'KICKOFF' });
    expect(m.status).toBe('LIVE');
    expect(m.periodStartedAt).not.toBeNull();
    expect(m.currentPeriod).toBe(1);
  });

  it('END from LIVE banks elapsed time and completes', async () => {
    stored = makeMatch({
      status: 'LIVE',
      periodStartedAt: new Date(Date.now() - 60_000),
      pausedElapsedMs: 0,
    });
    const m = await service.clock('u1', stored.id, { action: 'END' });
    expect(m.status).toBe('COMPLETED');
    expect(m.periodStartedAt).toBeNull();
    expect(m.pausedElapsedMs).toBeGreaterThanOrEqual(60_000);
  });

  it('maps invalid transitions to BadRequest', async () => {
    stored = makeMatch({ status: 'COMPLETED' });
    await expect(service.clock('u1', stored.id, { action: 'RESUME' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects SET_PERIOD beyond the sport maximum', async () => {
    stored = makeMatch({ status: 'LIVE', periodStartedAt: new Date() });
    await expect(
      service.clock('u1', stored.id, { action: 'SET_PERIOD', period: 99 }),
    ).rejects.toThrow(BadRequestException);
  });
});
