import { describe, expect, it } from 'vitest';
import { CreateMatchSchema } from './match.js';
import { RecordEventSchema } from './event.js';

const uuid = '11111111-1111-4111-8111-111111111111';
const uuid2 = '22222222-2222-4222-8222-222222222222';

describe('CreateMatchSchema', () => {
  it('rejects identical home and away teams', () => {
    const result = CreateMatchSchema.safeParse({
      sport: 'FOOTBALL',
      homeTeamId: uuid,
      awayTeamId: uuid,
    });
    expect(result.success).toBe(false);
  });

  it('applies BASIC tier and startNow defaults', () => {
    const result = CreateMatchSchema.parse({
      sport: 'FOOTBALL',
      homeTeamId: uuid,
      awayTeamId: uuid2,
      scheduledAt: '2026-07-08T10:00:00.000Z',
    });
    expect(result.statTier).toBe('BASIC');
    expect(result.startNow).toBe(false);
  });
});

describe('RecordEventSchema', () => {
  it('defaults clockMs to 0 and requires a client id', () => {
    const result = RecordEventSchema.parse({
      id: uuid,
      matchId: uuid2,
      type: 'goal',
      side: 'HOME',
      period: 1,
    });
    expect(result.clockMs).toBe(0);
  });
});
