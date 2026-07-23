import { describe, expect, it } from 'vitest';
import type { MatchEvent } from '@bleachers/types';
import { footballConfig } from '../config/football.js';
import { aggregatePlayerCareer, computeTeamStats } from './career.js';

function goal(matchId: string, playerId: string, voided = false): MatchEvent {
  return {
    id: `${matchId}-${playerId}-${voided}`,
    matchId,
    type: 'goal',
    side: 'HOME',
    playerId,
    period: 1,
    clockMs: 0,
    metadata: {},
    voided,
    voidedById: null,
    voidedAt: null,
    replacesEventId: null,
    recordedById: 'u',
    recordedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('aggregatePlayerCareer', () => {
  it('sums totals across matches and computes per-game averages', () => {
    const events = [goal('m1', 'p1'), goal('m2', 'p1'), goal('m2', 'p1'), goal('m1', 'p2')];
    const career = aggregatePlayerCareer(footballConfig, 'p1', events, 2);
    const goals = career.totals.find((s) => s.key === 'goal')!;
    expect(goals.value).toBe(3);
    const perGame = career.averages.find((s) => s.key === 'goal_per_game')!;
    expect(perGame.value).toBe(1.5);
    expect(career.appearances).toBe(2);
  });

  it('excludes voided events', () => {
    const events = [goal('m1', 'p1'), goal('m1', 'p1', true)];
    const career = aggregatePlayerCareer(footballConfig, 'p1', events, 1);
    expect(career.totals.find((s) => s.key === 'goal')!.value).toBe(1);
  });
});

describe('computeTeamStats', () => {
  it('computes WDL, goals, and 5-match form (most recent first)', () => {
    const stats = computeTeamStats('t1', [
      { goalsFor: 3, goalsAgainst: 1 }, // W
      { goalsFor: 0, goalsAgainst: 0 }, // D
      { goalsFor: 1, goalsAgainst: 2 }, // L
      { goalsFor: 2, goalsAgainst: 2 }, // D
    ]);
    expect(stats.played).toBe(4);
    expect(stats.won).toBe(1);
    expect(stats.drawn).toBe(2);
    expect(stats.lost).toBe(1);
    expect(stats.goalsFor).toBe(6);
    expect(stats.goalsAgainst).toBe(5);
    expect(stats.form).toEqual(['W', 'D', 'L', 'D']);
  });
});
