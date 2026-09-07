import { describe, expect, it } from 'vitest';
import { computeStandings, type StandingsMatchResult } from './standings.js';

const r = (
  homeTeamId: string,
  homeGoals: number,
  awayTeamId: string,
  awayGoals: number,
): StandingsMatchResult => ({ homeTeamId, awayTeamId, homeGoals, awayGoals });

describe('computeStandings', () => {
  it('returns an empty table for no results', () => {
    expect(computeStandings([])).toEqual([]);
  });

  it('awards 3 for a win and 0 for a loss', () => {
    const [top, bottom] = computeStandings([r('a', 2, 'b', 1)]);
    expect(top).toMatchObject({ teamId: 'a', played: 1, won: 1, lost: 0, points: 3 });
    expect(bottom).toMatchObject({ teamId: 'b', played: 1, won: 0, lost: 1, points: 0 });
  });

  it('awards 1 point each for a draw', () => {
    const rows = computeStandings([r('a', 1, 'b', 1)]);
    expect(rows.every((x) => x.points === 1 && x.drawn === 1)).toBe(true);
  });

  it('accumulates goals for and against from both fixtures', () => {
    const rows = computeStandings([r('a', 3, 'b', 0), r('b', 2, 'a', 1)]);
    const a = rows.find((x) => x.teamId === 'a')!;
    expect(a).toMatchObject({ played: 2, won: 1, lost: 1, goalsFor: 4, goalsAgainst: 2 });
    expect(a.goalDifference).toBe(2);
  });

  it('orders by points, then goal difference, then goals scored', () => {
    // c and b both finish on 3 points; c has the better difference.
    const rows = computeStandings([r('a', 5, 'b', 0), r('c', 3, 'd', 0), r('b', 1, 'd', 0)]);
    expect(rows[0]!.teamId).toBe('a'); // 3 pts, +5
    expect(rows[1]!.teamId).toBe('c'); // 3 pts, +3
    expect(rows[2]!.teamId).toBe('b'); // 3 pts, -4
  });

  it('breaks a total tie deterministically by teamId', () => {
    const rows = computeStandings([r('z', 1, 'a', 1)]);
    expect(rows.map((x) => x.teamId)).toEqual(['a', 'z']);
  });

  it('honours custom points values', () => {
    const [top] = computeStandings([r('a', 1, 'b', 0)], { win: 2 });
    expect(top!.points).toBe(2);
  });
});
