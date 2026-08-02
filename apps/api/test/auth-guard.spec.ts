import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { afterEach, describe, expect, it } from 'vitest';
import { AuthGuard } from '../src/auth/auth.guard.js';
import { env } from '../src/config/env.js';
import type { JwtVerifier } from '../src/auth/supabase-jwt.js';

/** Minimal ExecutionContext — the guard only touches the HTTP request. */
function contextFor(headers: Record<string, string>) {
  const request: Record<string, unknown> = { headers };
  return {
    request,
    ctx: {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => function handler() {},
      getClass: () => class Controller {},
    },
  };
}

const verifierFor = (email: string | null): JwtVerifier => ({
  verify: async () => ({ id: 'user-1', email, name: null, image: null }),
});

const guardFor = (email: string | null) => new AuthGuard(new Reflector(), verifierFor(email));

const AUTHED = { authorization: 'Bearer token' };

describe('AuthGuard pre-launch allowlist', () => {
  const original = env.allowedEmails;
  afterEach(() => {
    env.allowedEmails = original;
  });

  it('lets any verified user through when the allowlist is empty', async () => {
    env.allowedEmails = [];
    const { ctx, request } = contextFor(AUTHED);
    await expect(guardFor('anyone@example.com').canActivate(ctx as never)).resolves.toBe(true);
    expect(request.user).toMatchObject({ email: 'anyone@example.com' });
  });

  it('rejects a valid session whose email is not allowlisted', async () => {
    env.allowedEmails = ['owner@example.com'];
    const { ctx, request } = contextFor(AUTHED);
    await expect(guardFor('stranger@example.com').canActivate(ctx as never)).rejects.toThrow(
      ForbiddenException,
    );
    // Nothing downstream should ever see a rejected user.
    expect(request.user).toBeUndefined();
  });

  it('admits an allowlisted email regardless of case', async () => {
    env.allowedEmails = ['owner@example.com'];
    const { ctx } = contextFor(AUTHED);
    await expect(guardFor('Owner@Example.COM').canActivate(ctx as never)).resolves.toBe(true);
  });

  it('rejects a token-less user with no email while the allowlist is on', async () => {
    env.allowedEmails = ['owner@example.com'];
    const { ctx } = contextFor(AUTHED);
    await expect(guardFor(null).canActivate(ctx as never)).rejects.toThrow(ForbiddenException);
  });

  it('still refuses a missing bearer token before any allowlist check', async () => {
    env.allowedEmails = [];
    const { ctx } = contextFor({});
    await expect(guardFor('owner@example.com').canActivate(ctx as never)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
