import { describe, expect, it } from 'vitest';
import type { MatchEvent } from '@bleachers/types';
import { footballConfig } from '../config/football.js';
import { reduceMatch } from './reduce.js';

const MATCH = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
let seq = 0;

function ev(partial: Partial<MatchEvent> & Pick<MatchEvent, 'type' | 'side'>): MatchEvent {
  seq += 1;
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    matchId: MATCH,
    playerId: null,
    period: 1,
    clockMs: seq * 1000,
    metadata: {},
    voided: false,
    voidedById: null,
    voidedAt: null,
    replacesEventId: null,
    recordedById: 'user',
    recordedAt: new Date(2026, 0, 1, 0, 0, seq).toISOString(),
    ...partial,
  };
}

describe('reduceMatch — football scoring', () => {
  it('counts goals for the scoring side', () => {
    const events = [
      ev({ type: 'goal', side: 'HOME', playerId: 'p1' }),
      ev({ type: 'goal', side: 'HOME', playerId: 'p2' }),
      ev({ type: 'goal', side: 'AWAY', playerId: 'p3' }),
    ];
    const stats = reduceMatch(footballConfig, MATCH, events);
    expect(stats.score).toEqual([2, 1]);
    expect(stats.version).toBe(3);
  });

  it('credits an own goal to the opponent', () => {
    const events = [ev({ type: 'own_goal', side: 'HOME', playerId: 'p1' })];
    const stats = reduceMatch(footballConfig, MATCH, events);
    expect(stats.score).toEqual([0, 1]);
  });

  it('ignores voided events (corrections are lossless)', () => {
    const events = [
      ev({ type: 'goal', side: 'HOME', playerId: 'p1' }),
      ev({ type: 'goal', side: 'HOME', playerId: 'p1', voided: true }),
    ];
    const stats = reduceMatch(footballConfig, MATCH, events);
    expect(stats.score).toEqual([1, 0]);
  });

  it('produces a timeline with running score and marks scoring events', () => {
    const events = [
      ev({ type: 'goal', side: 'HOME', playerId: 'p1' }),
      ev({ type: 'yellow_card', side: 'AWAY', playerId: 'p3' }),
      ev({ type: 'goal', side: 'AWAY', playerId: 'p3' }),
    ];
    const { timeline } = reduceMatch(footballConfig, MATCH, events);
    expect(timeline.map((t) => t.scoreAfter)).toEqual([
      [1, 0],
      [1, 0],
      [1, 1],
    ]);
    expect(timeline.map((t) => t.isScoring)).toEqual([true, false, true]);
  });

  it('breaks the score down by period', () => {
    const events = [
      ev({ type: 'goal', side: 'HOME', playerId: 'p1', period: 1 }),
      ev({ type: 'goal', side: 'AWAY', playerId: 'p3', period: 2 }),
      ev({ type: 'goal', side: 'HOME', playerId: 'p2', period: 2 }),
    ];
    const { scoreByPeriod } = reduceMatch(footballConfig, MATCH, events);
    expect(scoreByPeriod).toEqual([
      [1, 0],
      [1, 1],
    ]);
  });

  it('aggregates per-player stats and hides advanced columns in BASIC matches', () => {
    const events = [
      ev({ type: 'goal', side: 'HOME', playerId: 'p1' }),
      ev({ type: 'assist', side: 'HOME', playerId: 'p2' }),
    ];
    const stats = reduceMatch(footballConfig, MATCH, events, 'BASIC');
    const p1 = stats.players.find((p) => p.playerId === 'p1')!;
    const goals = p1.stats.find((s) => s.key === 'goal')!;
    expect(goals.value).toBe(1);
    // 'shot' is an advanced column — absent in a BASIC match.
    expect(p1.stats.find((s) => s.key === 'shot')).toBeUndefined();
  });

  it('computes advanced derived stats (shot accuracy) in ADVANCED matches', () => {
    const events = [
      ev({ type: 'shot', side: 'HOME', playerId: 'p1' }),
      ev({ type: 'shot', side: 'HOME', playerId: 'p1' }),
      ev({ type: 'shot_on_target', side: 'HOME', playerId: 'p1' }),
    ];
    const stats = reduceMatch(footballConfig, MATCH, events, 'ADVANCED');
    const p1 = stats.players.find((p) => p.playerId === 'p1')!;
    const acc = p1.stats.find((s) => s.key === 'shot_accuracy')!;
    // 1 on target / 2 shots * 100 = 50
    expect(acc.value).toBe(50);
    expect(acc.format).toBe('percent');
  });
});
