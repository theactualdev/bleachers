import type { VerifiedUser } from './supabase-jwt.js';

/** The authenticated principal attached to the request by AuthGuard. */
export type AuthUser = VerifiedUser;
