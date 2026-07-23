import { describe, it, expect } from 'vitest';
import { SignJWT, exportJWK, generateKeyPair, createLocalJWKSet } from 'jose';
import { createSupabaseJwtVerifier } from '../src/auth/supabase-jwt';

const ISSUER = 'https://ref.supabase.co/auth/v1';

async function setup() {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey);
  jwk.kid = 'test-key';
  jwk.alg = 'RS256';
  const keyResolver = createLocalJWKSet({ keys: [jwk] });
  return { privateKey, keyResolver };
}

function verifier(keyResolver: unknown) {
  return createSupabaseJwtVerifier({
    jwksUrl: 'http://unused',
    issuer: ISSUER,
    keyResolver: keyResolver as never,
  });
}

async function sign(
  privateKey: CryptoKey,
  claims: Record<string, unknown>,
  opts?: { aud?: string; exp?: string },
) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(ISSUER)
    .setAudience(opts?.aud ?? 'authenticated')
    .setSubject('11111111-1111-4111-8111-111111111111')
    .setIssuedAt()
    .setExpirationTime(opts?.exp ?? '1h')
    .sign(privateKey);
}

describe('createSupabaseJwtVerifier', () => {
  it('verifies a valid token and maps claims', async () => {
    const { privateKey, keyResolver } = await setup();
    const token = await sign(privateKey, {
      email: 'demo@bleachers.app',
      user_metadata: { name: 'Demo', avatar_url: 'https://x/y.png' },
    });
    const user = await verifier(keyResolver).verify(token);
    expect(user).toEqual({
      id: '11111111-1111-4111-8111-111111111111',
      email: 'demo@bleachers.app',
      name: 'Demo',
      image: 'https://x/y.png',
    });
  });

  it('rejects a token with the wrong audience', async () => {
    const { privateKey, keyResolver } = await setup();
    const token = await sign(privateKey, { email: 'x@y.z' }, { aud: 'somethingelse' });
    await expect(verifier(keyResolver).verify(token)).rejects.toBeTruthy();
  });

  it('rejects an expired token', async () => {
    const { privateKey, keyResolver } = await setup();
    const token = await sign(privateKey, { email: 'x@y.z' }, { exp: '-1h' });
    await expect(verifier(keyResolver).verify(token)).rejects.toBeTruthy();
  });
});
