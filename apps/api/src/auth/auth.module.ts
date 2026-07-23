import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { env } from '../config/env.js';
import { AuthGuard } from './auth.guard.js';
import { AuthController } from './auth.controller.js';
import { JWT_VERIFIER } from './auth.tokens.js';
import { createSupabaseJwtVerifier } from './supabase-jwt.js';

@Global()
@Module({
  controllers: [AuthController],
  providers: [
    {
      provide: JWT_VERIFIER,
      useFactory: () =>
        createSupabaseJwtVerifier({
          jwksUrl: env.supabase.jwksUrl,
          issuer: env.supabase.issuer,
        }),
    },
    AuthGuard,
    { provide: APP_GUARD, useExisting: AuthGuard },
  ],
  exports: [JWT_VERIFIER, AuthGuard],
})
export class AuthModule {}
