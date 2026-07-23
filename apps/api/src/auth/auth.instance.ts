import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { magicLink } from 'better-auth/plugins';
import type { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';
import { sendMagicLinkEmail } from './email.js';

/**
 * The Better Auth instance. Mounted on the NestJS Express server at `/api/auth/*` and shared with
 * the guard for session validation. Magic-link + (optional) Google OAuth.
 */
export function createAuth(prisma: PrismaClient) {
  return betterAuth({
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    baseURL: env.betterAuthUrl,
    secret: env.betterAuthSecret,
    basePath: '/api/auth',
    trustedOrigins: env.webOrigins,
    // Passwords are disabled: this is a magic-link + OAuth product.
    emailAndPassword: { enabled: false },
    socialProviders: env.google
      ? {
          google: {
            clientId: env.google.clientId,
            clientSecret: env.google.clientSecret,
          },
        }
      : {},
    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30 days
      updateAge: 60 * 60 * 24, // refresh daily
    },
    plugins: [
      magicLink({
        expiresIn: 60 * 10, // 10 minutes
        sendMagicLink: async ({ email, url }) => {
          await sendMagicLinkEmail(email, url);
        },
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

/** DI token for the Better Auth instance. */
export const AUTH = Symbol('BETTER_AUTH');
