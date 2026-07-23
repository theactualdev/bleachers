import { z } from 'zod';
import { IdSchema } from './common.js';
import { PermissionScopeSchema, RoleSchema } from './enums.js';

/** The authenticated user as surfaced to the app (subset of the Better Auth user record). */
export const UserSchema = z.object({
  id: IdSchema,
  email: z.string().email(),
  name: z.string().nullable(),
  image: z.string().url().nullable(),
  emailVerified: z.boolean(),
  createdAt: z.string().datetime({ offset: true }),
});
export type User = z.infer<typeof UserSchema>;

/**
 * A permission grant ties a user to a role over a scoped resource.
 * e.g. { role: SCORER, scope: MATCH, resourceId: <matchId> }.
 */
export const PermissionGrantSchema = z.object({
  id: IdSchema,
  userId: IdSchema,
  role: RoleSchema,
  scope: PermissionScopeSchema,
  resourceId: IdSchema,
  createdAt: z.string().datetime({ offset: true }),
});
export type PermissionGrant = z.infer<typeof PermissionGrantSchema>;

export const CreatePermissionGrantSchema = PermissionGrantSchema.pick({
  userId: true,
  role: true,
  scope: true,
  resourceId: true,
});
export type CreatePermissionGrantInput = z.infer<typeof CreatePermissionGrantSchema>;
