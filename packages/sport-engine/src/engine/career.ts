import type { MatchEvent, PlayerCareerStats, StatValue, TeamStats } from '@bleachers/types';
import type { SportConfig } from '../config/schema.js';
import { evaluateExpression } from './expr.js';

/**
 * Aggregate a single player's career stats by folding all of their (non-voided) events across
 * matches. Totals are raw counts; averages are per-appearance. Derived stats recompute from the
 * summed tallies. Phase 1 assumes a single sport per call — multi-sport careers group by sport
 * upstream and call this once per sport.
 */
export function aggregatePlayerCareer(
  config: SportConfig,
  playerId: string,
  events: readonly MatchEvent[],
  appearances: number,
): PlayerCareerStats {
  const eventTypeById = new Map(config.eventTypes.map((e) => [e.id, e]));
  const tally: Record<string, number> = {};

  for (const ev of events) {
    if (ev.voided || ev.playerId !== playerId) continue;
    tally[ev.type] = (tally[ev.type] ?? 0) + 1;
  }

  const totals: StatValue[] = [];
  const averages: StatValue[] = [];
  const denom = appearances > 0 ? appearances : 1;

  for (const key of config.playerStatColumns) {
    const def = eventTypeById.get(key);
    if (!def) continue;
    const total = tally[key] ?? 0;
    totals.push({ key, label: def.shortLabel ?? def.label, value: total, format: 'int' });
    averages.push({
      key: `${key}_per_game`,
      label: `${def.shortLabel ?? def.label}/game`,
      value: Math.round((total / denom) * 100) / 100,
      format: 'decimal',
    });
  }

  for (const d of config.derivedStats.filter((s) => s.scope === 'player')) {
    const raw = evaluateExpression(d.expr, tally);
    totals.push({
      key: d.key,
      label: d.label,
      value: d.format === 'int' ? Math.round(raw) : Math.round(raw * 10) / 10,
      format: d.format,
    });
  }

  return { playerId, appearances, totals, averages };
}

/** The result of one match from a single team's perspective. */
export interface TeamMatchResult {
  goalsFor: number;
  goalsAgainst: number;
  /** Most-recent-first ordering is the caller's responsibility. */
}

/**
 * Compute win/draw/loss, goals, and recent form for a team from an ordered (most-recent-first)
 * list of its match results. Pure — the API derives `TeamMatchResult`s via `reduceMatch`.
 */
export function computeTeamStats(teamId: string, results: readonly TeamMatchResult[]): TeamStats {
  let won = 0;
  let drawn = 0;
  let lost = 0;
  let goalsFor = 0;
  let goalsAgainst = 0;
  const form: TeamStats['form'] = [];

  for (const r of results) {
    goalsFor += r.goalsFor;
    goalsAgainst += r.goalsAgainst;
    if (r.goalsFor > r.goalsAgainst) {
      won++;
      if (form.length < 5) form.push('W');
    } else if (r.goalsFor < r.goalsAgainst) {
      lost++;
      if (form.length < 5) form.push('L');
    } else {
      drawn++;
      if (form.length < 5) form.push('D');
    }
  }

  return {
    teamId,
    played: results.length,
    won,
    drawn,
    lost,
    goalsFor,
    goalsAgainst,
    form,
  };
}
