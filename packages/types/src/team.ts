import { z } from 'zod';
import { IdSchema, JerseyNumberSchema, TeamColorsSchema } from './common.js';
import { SportSchema } from './enums.js';
import { PlayerSchema } from './player.js';

export const TeamSchema = z.object({
  id: IdSchema,
  name: z.string().min(1).max(120),
  colors: TeamColorsSchema,
  logo: z.string().url().nullable().or(z.string().startsWith('data:').nullable()),
  sport: SportSchema,
  /** Ad-hoc teams are throwaway sides created to get a match started fast. */
  isAdHoc: z.boolean().default(false),
  createdById: IdSchema,
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});
export type Team = z.infer<typeof TeamSchema>;

export const CreateTeamSchema = TeamSchema.pick({
  name: true,
  colors: true,
  logo: true,
  sport: true,
  isAdHoc: true,
}).partial({ logo: true, isAdHoc: true });
export type CreateTeamInput = z.infer<typeof CreateTeamSchema>;

export const UpdateTeamSchema = CreateTeamSchema.partial();
export type UpdateTeamInput = z.infer<typeof UpdateTeamSchema>;

/** A roster row is the many-to-many join of a player onto a team, with a jersey number. */
export const RosterEntrySchema = z.object({
  id: IdSchema,
  teamId: IdSchema,
  playerId: IdSchema,
  jerseyNumber: JerseyNumberSchema,
  createdAt: z.string().datetime({ offset: true }),
});
export type RosterEntry = z.infer<typeof RosterEntrySchema>;

/** Roster entry with the player joined in — convenient for team-profile reads. */
export const RosterEntryWithPlayerSchema = RosterEntrySchema.extend({
  player: PlayerSchema,
});
export type RosterEntryWithPlayer = z.infer<typeof RosterEntryWithPlayerSchema>;

export const AddRosterEntrySchema = z.object({
  playerId: IdSchema,
  jerseyNumber: JerseyNumberSchema.optional(),
});
export type AddRosterEntryInput = z.infer<typeof AddRosterEntrySchema>;
