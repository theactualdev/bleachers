import { z } from 'zod';
import { IdSchema } from './common.js';
import { MatchSideSchema } from './enums.js';

/**
 * Canonical shapes for DERIVED statistics. These are never persisted — the engine produces them
 * by folding the event stream — but the shapes live here so API and web share one contract.
 */

/** A single named stat value (count or derived formula result). */
export const StatValueSchema = z.object({
  key: z.string(),
  label: z.string(),
  value: z.number(),
  /** Optional formatting hint for the UI: 'int' | 'percent' | 'decimal'. */
  format: z.enum(['int', 'percent', 'decimal']).default('int'),
});
export type StatValue = z.infer<typeof StatValueSchema>;

/** Per-player line within a match. */
export const PlayerMatchStatsSchema = z.object({
  playerId: IdSchema,
  side: MatchSideSchema,
  stats: z.array(StatValueSchema),
});
export type PlayerMatchStats = z.infer<typeof PlayerMatchStatsSchema>;

/** One entry in the match timeline (derived, ordered). */
export const TimelineEntrySchema = z.object({
  eventId: IdSchema,
  type: z.string(),
  label: z.string(),
  side: MatchSideSchema,
  playerId: IdSchema.nullable(),
  period: z.number().int(),
  clockMs: z.number().int(),
  /** Running score immediately after this event, as [home, away]. */
  scoreAfter: z.tuple([z.number().int(), z.number().int()]),
  isScoring: z.boolean(),
});
export type TimelineEntry = z.infer<typeof TimelineEntrySchema>;

/** The full derived state of a match. */
export const MatchStatsSchema = z.object({
  matchId: IdSchema,
  score: z.tuple([z.number().int(), z.number().int()]),
  /** Score broken down by period, each [home, away]. */
  scoreByPeriod: z.array(z.tuple([z.number().int(), z.number().int()])),
  timeline: z.array(TimelineEntrySchema),
  players: z.array(PlayerMatchStatsSchema),
  /** Team-level aggregate stats keyed by side. */
  teamStats: z.object({
    HOME: z.array(StatValueSchema),
    AWAY: z.array(StatValueSchema),
  }),
  /** Monotonic version = count of applied (non-voided) events; used as a cache key. */
  version: z.number().int(),
});
export type MatchStats = z.infer<typeof MatchStatsSchema>;

/** Aggregated career totals for a player across many matches. */
export const PlayerCareerStatsSchema = z.object({
  playerId: IdSchema,
  appearances: z.number().int(),
  totals: z.array(StatValueSchema),
  averages: z.array(StatValueSchema),
});
export type PlayerCareerStats = z.infer<typeof PlayerCareerStatsSchema>;

/** Win/Draw/Loss + form for a team. */
export const TeamStatsSchema = z.object({
  teamId: IdSchema,
  played: z.number().int(),
  won: z.number().int(),
  drawn: z.number().int(),
  lost: z.number().int(),
  goalsFor: z.number().int(),
  goalsAgainst: z.number().int(),
  /** Most-recent-first list of 'W' | 'D' | 'L'. */
  form: z.array(z.enum(['W', 'D', 'L'])),
});
export type TeamStats = z.infer<typeof TeamStatsSchema>;
