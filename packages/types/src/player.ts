import { z } from 'zod';
import { IdSchema } from './common.js';

export const PlayerSchema = z.object({
  id: IdSchema,
  name: z.string().min(1).max(120),
  /** Date of birth as YYYY-MM-DD (nullable — grassroots players may not provide it). */
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD')
    .nullable(),
  /** URL or data-URI to a photo. */
  photo: z.string().url().nullable().or(z.string().startsWith('data:').nullable()),
  createdById: IdSchema,
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});
export type Player = z.infer<typeof PlayerSchema>;

export const CreatePlayerSchema = PlayerSchema.pick({
  name: true,
  dateOfBirth: true,
  photo: true,
}).partial({ dateOfBirth: true, photo: true });
export type CreatePlayerInput = z.infer<typeof CreatePlayerSchema>;

export const UpdatePlayerSchema = CreatePlayerSchema.partial();
export type UpdatePlayerInput = z.infer<typeof UpdatePlayerSchema>;
