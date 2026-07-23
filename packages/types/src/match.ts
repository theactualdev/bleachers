import { z } from 'zod';
import { IdSchema, JerseyNumberSchema } from './common.js';
import { MatchSideSchema, MatchStatusSchema, SportSchema, StatTierSchema } from './enums.js';

export const MatchSchema = z.object({
  id: IdSchema,
  sport: SportSchema,
  homeTeamId: IdSchema,
  awayTeamId: IdSchema,
  venue: z.string().max(200).nullable(),
  /** Scheduled/kickoff datetime. */
  scheduledAt: z.string().datetime({ offset: true }),
  status: MatchStatusSchema,
  statTier: StatTierSchema,
  /** Optional link to a competition — matches exist independently of competitions. */
  competitionId: IdSchema.nullable(),
  createdById: IdSchema,
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});
export type Match = z.infer<typeof MatchSchema>;

/** A lineup row: a player fielded for one side of a match. */
export const MatchLineupSchema = z.object({
  id: IdSchema,
  matchId: IdSchema,
  side: MatchSideSchema,
  playerId: IdSchema,
  isStarter: z.boolean(),
  /** Overrides the roster jersey number for this match only. */
  jerseyNumberOverride: JerseyNumberSchema,
  createdAt: z.string().datetime({ offset: true }),
});
export type MatchLineup = z.infer<typeof MatchLineupSchema>;

// ─── Creation flow (choose sport → teams → lineups → tier → schedule/start) ─────

export const LineupSelectionSchema = z.object({
  playerId: IdSchema,
  isStarter: z.boolean().default(true),
  jerseyNumberOverride: JerseyNumberSchema.optional(),
});
export type LineupSelection = z.infer<typeof LineupSelectionSchema>;

/**
 * Single-call match creation, sized for the "<30 second" flow. Teams and players must already
 * exist (they can be created inline via their own endpoints first). `startNow` transitions the
 * match straight to LIVE.
 */
export const CreateMatchSchema = z
  .object({
    sport: SportSchema,
    homeTeamId: IdSchema,
    awayTeamId: IdSchema,
    venue: z.string().max(200).optional(),
    scheduledAt: z.string().datetime({ offset: true }).optional(),
    statTier: StatTierSchema.default('BASIC'),
    competitionId: IdSchema.optional(),
    startNow: z.boolean().default(false),
    homeLineup: z.array(LineupSelectionSchema).default([]),
    awayLineup: z.array(LineupSelectionSchema).default([]),
  })
  .refine((m) => m.homeTeamId !== m.awayTeamId, {
    message: 'Home and away teams must differ',
    path: ['awayTeamId'],
  });
export type CreateMatchInput = z.infer<typeof CreateMatchSchema>;

export const UpdateMatchSchema = z.object({
  venue: z.string().max(200).nullable().optional(),
  scheduledAt: z.string().datetime({ offset: true }).optional(),
  status: MatchStatusSchema.optional(),
  statTier: StatTierSchema.optional(),
  competitionId: IdSchema.nullable().optional(),
});
export type UpdateMatchInput = z.infer<typeof UpdateMatchSchema>;
