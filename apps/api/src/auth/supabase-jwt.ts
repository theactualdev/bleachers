import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';

export interface VerifiedUser {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
}

export interface JwtVerifier {
  verify(token: string): Promise<VerifiedUser>;
}

interface SupabaseClaims extends JWTPayload {
  email?: string;
  user_metadata?: { name?: string; full_name?: string; avatar_url?: string };
}

function mapPayload(payload: SupabaseClaims): VerifiedUser {
  const meta = payload.user_metadata ?? {};
  return {
    id: String(payload.sub),
    email: payload.email ?? null,
    name: meta.name ?? meta.full_name ?? null,
    image: meta.avatar_url ?? null,
  };
}

/**
 * Verifies Supabase access tokens locally against the project's JWKS (asymmetric
 * signing keys). The JWKS is fetched once and cached by `jose`. Tests inject a
 * local key set via `keyResolver`.
 */
export function createSupabaseJwtVerifier(opts: {
  jwksUrl: string;
  issuer: string;
  audience?: string;
  keyResolver?: JWTVerifyGetKey;
}): JwtVerifier {
  const jwks = opts.keyResolver ?? createRemoteJWKSet(new URL(opts.jwksUrl));
  return {
    async verify(token: string): Promise<VerifiedUser> {
      const { payload } = await jwtVerify(token, jwks, {
        issuer: opts.issuer,
        audience: opts.audience ?? 'authenticated',
      });
      return mapPayload(payload as SupabaseClaims);
    },
  };
}
