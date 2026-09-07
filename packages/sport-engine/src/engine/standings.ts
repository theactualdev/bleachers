/**
 * League table as a pure fold over finished matches.
 *
 * Deliberately separate from `TeamMatchResult` in career.ts: that shape carries
 * only goals for/against from one team's view and cannot say who played whom,
 * which is exactly what a table needs. Nothing here is persisted — standings are
 * recomputed per request, the same way MatchStats is.
 */

export interface StandingsMatchResult {
  homeTeamId: string;
  awayTeamId: string;
  homeGoals: number;
  awayGoals: number;
}

export interface StandingsRow {
  teamId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

function blank(teamId: string): StandingsRow {
  return {
    teamId,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0,
  };
}

export function computeStandings(
  results: readonly StandingsMatchResult[],
  opts: { win?: number; draw?: number } = {},
): StandingsRow[] {
  const win = opts.win ?? 3;
  const draw = opts.draw ?? 1;
  const table = new Map<string, StandingsRow>();
  const row = (id: string) => {
    const existing = table.get(id);
    if (existing) return existing;
    const fresh = blank(id);
    table.set(id, fresh);
    return fresh;
  };

  for (const m of results) {
    const home = row(m.homeTeamId);
    const away = row(m.awayTeamId);

    home.played += 1;
    away.played += 1;
    home.goalsFor += m.homeGoals;
    home.goalsAgainst += m.awayGoals;
    away.goalsFor += m.awayGoals;
    away.goalsAgainst += m.homeGoals;

    if (m.homeGoals > m.awayGoals) {
      home.won += 1;
      home.points += win;
      away.lost += 1;
    } else if (m.homeGoals < m.awayGoals) {
      away.won += 1;
      away.points += win;
      home.lost += 1;
    } else {
      home.drawn += 1;
      away.drawn += 1;
      home.points += draw;
      away.points += draw;
    }
  }

  for (const r of table.values()) r.goalDifference = r.goalsFor - r.goalsAgainst;

  // Points, then goal difference, then goals scored — and finally teamId so the
  // order is stable for identical rows rather than depending on insertion order.
  return [...table.values()].sort(
    (a, b) =>
      b.points - a.points ||
      b.goalDifference - a.goalDifference ||
      b.goalsFor - a.goalsFor ||
      a.teamId.localeCompare(b.teamId),
  );
}
