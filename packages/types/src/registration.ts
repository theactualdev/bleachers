import { z } from 'zod';
import { JerseyNumberSchema, TeamColorsSchema } from './common.js';

const PhotoSchema = z.string().url().nullable().or(z.string().startsWith('data:').nullable());

export const RegisterTeamPlayerSchema = z.object({
  name: z.string().min(1).max(120),
  jerseyNumber: JerseyNumberSchema.optional(),
  photo: PhotoSchema.optional(),
});

export const RegisterTeamSchema = z.object({
  name: z.string().min(1).max(120),
  colors: TeamColorsSchema,
  logo: PhotoSchema.optional(),
  players: z.array(RegisterTeamPlayerSchema).max(40).default([]),
});
export type RegisterTeamInput = z.infer<typeof RegisterTeamSchema>;

export const CreateTeamPlayerSchema = RegisterTeamPlayerSchema;
export type CreateTeamPlayerInput = z.infer<typeof CreateTeamPlayerSchema>;
