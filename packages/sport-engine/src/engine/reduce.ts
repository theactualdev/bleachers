import type {
  MatchEvent,
  MatchSide,
  MatchStats,
  PlayerMatchStats,
  StatTier,
  StatValue,
  TimelineEntry,
} from '@bleachers/types';
import type { DerivedStatDef, EventTypeDef, SportConfig } from '../config/schema.js';
import { evaluateExpression } from './expr.js';

const OTHER: Record<MatchSide, MatchSide> = { HOME: 'AWAY', AWAY: 'HOME' };

type Tally = Record<string, number>;

/** Deterministic ordering so the running score and timeline are stable across recomputes. */
function orderEvents(events: readonly MatchEvent[]): MatchEvent[] {
  return [...events].sort((a, b) => {
    if (a.period !== b.period) return a.period - b.period;
    if (a.clockMs !== b.clockMs) return a.clockMs - b.clockMs;
    return a.recordedAt.localeCompare(b.recordedAt);
  });
}

function tierAllows(matchTier: StatTier, itemTier: StatTier): boolean {
  // ADVANCED matches surface everything; BASIC matches only surface BASIC items.
  return matchTier === 'ADVANCED' || itemTier === 'BASIC';
}

function bump(tally: Tally, key: string): void {
  tally[key] = (tally[key] ?? 0) + 1;
}

function buildStatValues(
  columns: string[],
  eventTypeById: Map<string, EventTypeDef>,
  derived: DerivedStatDef[],
  scope: 'player' | 'team',
  tally: Tally,
  matchTier: StatTier,
): StatValue[] {
  const values: StatValue[] = [];

  for (const key of columns) {
    const def = eventTypeById.get(key);
    if (!def) continue;
    if (!tierAllows(matchTier, def.tier)) continue;
    values.push({
      key,
      label: def.shortLabel ?? def.label,
      value: tally[key] ?? 0,
      format: 'int',
    });
  }

  for (const d of derived) {
    if (d.scope !== scope) continue;
    // A stat whose tiers omit BASIC is advanced-only; hide it in BASIC matches.
    const advancedOnly = d.tiers ? !d.tiers.includes('BASIC') : false;
    if (advancedOnly && matchTier !== 'ADVANCED') continue;
    const raw = evaluateExpression(d.expr, tally);
    values.push({
      key: d.key,
      label: d.label,
      value: d.format === 'int' ? Math.round(raw) : Math.round(raw * 10) / 10,
      format: d.format,
    });
  }

  return values;
}

/**
 * Fold a match's event stream into fully-derived statistics. Pure and deterministic:
 * the same events + config always produce the same result. Voided events are ignored.
 */
export function reduceMatch(
  config: SportConfig,
  matchId: string,
  events: readonly MatchEvent[],
  statTier: StatTier = 'BASIC',
): MatchStats {
  const eventTypeById = new Map(config.eventTypes.map((e) => [e.id, e]));
  const applied = orderEvents(events).filter((e) => !e.voided && e.matchId === matchId);

  const score: [number, number] = [0, 0];
  const scoreByPeriod: [number, number][] = [];
  const timeline: TimelineEntry[] = [];

  const teamTally: Record<MatchSide, Tally> = { HOME: {}, AWAY: {} };
  const playerTally = new Map<string, Tally>();
  const playerSide = new Map<string, MatchSide>();

  const scoreIndex = (side: MatchSide) => (side === 'HOME' ? 0 : 1);

  for (const ev of applied) {
    const def = eventTypeById.get(ev.type);
    // Unknown event types are recorded in tallies but contribute no score/label logic.
    bump(teamTally[ev.side], ev.type);
    if (ev.playerId) {
      const t = playerTally.get(ev.playerId) ?? {};
      bump(t, ev.type);
      playerTally.set(ev.playerId, t);
      if (!playerSide.has(ev.playerId)) playerSide.set(ev.playerId, ev.side);
    }

    let isScoring = false;
    if (def?.score) {
      const scoringSide = def.score.side === 'SAME' ? ev.side : OTHER[ev.side];
      score[scoreIndex(scoringSide)] += def.score.points;
      while (scoreByPeriod.length < ev.period) scoreByPeriod.push([0, 0]);
      scoreByPeriod[ev.period - 1]![scoreIndex(scoringSide)] += def.score.points;
      isScoring = true;
    } else {
      while (scoreByPeriod.length < ev.period) scoreByPeriod.push([0, 0]);
    }

    timeline.push({
      eventId: ev.id,
      type: ev.type,
      label: def?.label ?? ev.type,
      side: ev.side,
      playerId: ev.playerId,
      period: ev.period,
      clockMs: ev.clockMs,
      scoreAfter: [score[0], score[1]],
      isScoring,
    });
  }

  const players: PlayerMatchStats[] = [];
  for (const [playerId, tally] of playerTally) {
    players.push({
      playerId,
      side: playerSide.get(playerId) ?? 'HOME',
      stats: buildStatValues(
        config.playerStatColumns,
        eventTypeById,
        config.derivedStats,
        'player',
        tally,
        statTier,
      ),
    });
  }

  const teamStatColumns = config.eventTypes.filter((e) => e.score).map((e) => e.id);
  const teamStats = {
    HOME: buildStatValues(
      teamStatColumns,
      eventTypeById,
      config.derivedStats,
      'team',
      teamTally.HOME,
      statTier,
    ),
    AWAY: buildStatValues(
      teamStatColumns,
      eventTypeById,
      config.derivedStats,
      'team',
      teamTally.AWAY,
      statTier,
    ),
  };

  return {
    matchId,
    score,
    scoreByPeriod,
    timeline,
    players,
    teamStats,
    version: applied.length,
  };
}
