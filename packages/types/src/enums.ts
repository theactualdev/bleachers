import { z } from 'zod';

/**
 * Sports supported by the engine. Phase 1 ships FOOTBALL; BASKETBALL and VOLLEYBALL
 * configs land in Phase 2 but the enum exists now so the data model is stable.
 */
export const SportSchema = z.enum(['FOOTBALL', 'BASKETBALL', 'VOLLEYBALL']);
export type Sport = z.infer<typeof SportSchema>;

/** Statistic tier chosen at match creation and used to gate which buttons render. */
export const StatTierSchema = z.enum(['BASIC', 'ADVANCED']);
export type StatTier = z.infer<typeof StatTierSchema>;

/** Lifecycle of a match. */
export const MatchStatusSchema = z.enum(['SCHEDULED', 'LIVE', 'PAUSED', 'COMPLETED', 'ABANDONED']);
export type MatchStatus = z.infer<typeof MatchStatusSchema>;

/** Which side of a match an event belongs to. */
export const MatchSideSchema = z.enum(['HOME', 'AWAY']);
export type MatchSide = z.infer<typeof MatchSideSchema>;

/**
 * Permission roles. Scope (team/competition/match) is carried separately on the grant.
 * Phase 1 enforces OWNER and SCORER on write paths; VIEWER is read-only.
 */
export const RoleSchema = z.enum(['OWNER', 'SCORER', 'VIEWER']);
export type Role = z.infer<typeof RoleSchema>;

export const PermissionScopeSchema = z.enum(['TEAM', 'COMPETITION', 'MATCH']);
export type PermissionScope = z.infer<typeof PermissionScopeSchema>;

/** Competition formats — modelled now, activated in Phase 3. */
export const CompetitionFormatSchema = z.enum([
  'KNOCKOUT',
  'ROUND_ROBIN',
  'GROUPS',
  'LADDER',
  'COLLECTION',
]);
export type CompetitionFormat = z.infer<typeof CompetitionFormatSchema>;
