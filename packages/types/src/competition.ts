import { z } from 'zod';
import { IdSchema } from './common.js';
import { CompetitionFormatSchema, SportSchema } from './enums.js';

/**
 * A competition groups matches. `CompetitionFormatSchema` already existed in
 * enums.ts (unused until now) — reused rather than redeclared.
 */
export const CompetitionSchema = z.object({
  id: IdSchema,
  name: z.string().min(1).max(120),
  sport: SportSchema,
  format: CompetitionFormatSchema,
  createdById: IdSchema,
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});
export type Competition = z.infer<typeof CompetitionSchema>;

export const CreateCompetitionSchema = z.object({
  name: z.string().min(1).max(120),
  sport: SportSchema,
  format: CompetitionFormatSchema,
});
export type CreateCompetitionInput = z.infer<typeof CreateCompetitionSchema>;

export const UpdateCompetitionSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  format: CompetitionFormatSchema.optional(),
});
export type UpdateCompetitionInput = z.infer<typeof UpdateCompetitionSchema>;

/** One row of a league table. Derived per request, never stored. */
export const StandingsEntrySchema = z.object({
  teamId: IdSchema,
  teamName: z.string(),
  played: z.number().int(),
  won: z.number().int(),
  drawn: z.number().int(),
  lost: z.number().int(),
  goalsFor: z.number().int(),
  goalsAgainst: z.number().int(),
  goalDifference: z.number().int(),
  points: z.number().int(),
});
export type StandingsEntry = z.infer<typeof StandingsEntrySchema>;

/** A scorer within one competition, most goals first. */
export const TopScorerSchema = z.object({
  playerId: IdSchema,
  playerName: z.string(),
  goals: z.number().int(),
});
export type TopScorer = z.infer<typeof TopScorerSchema>;
