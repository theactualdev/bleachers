# Supabase (Postgres + Auth) Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace local Docker Postgres with hosted Supabase Postgres and replace Better Auth with Supabase Auth, keeping the NestJS API as the sole data + authorization layer.

**Architecture:** The web app authenticates with Supabase Auth (magic link + optional Google) via `@supabase/supabase-js`, and attaches the Supabase access token as an `Authorization: Bearer` header to every NestJS API call. A rewritten global `AuthGuard` verifies that JWT locally against the project's JWKS with `jose`. Domain rows reference a `profiles` table keyed by the Supabase auth UUID, auto-populated by a trigger on `auth.users`. Prisma manages only the `public` schema and connects through Supabase's session pooler.

**Tech Stack:** NestJS, Prisma, Postgres (Supabase), `jose`, `@supabase/supabase-js`, Next.js (App Router), React Query, Vitest, Playwright, pnpm, Turborepo.

## Global Constraints

- Keep **zod v3** in our packages; do not upgrade to zod v4 (the `better-call` peer warning was Better-Auth-only and disappears with this migration).
- `@typescript-eslint/consistent-type-imports` stays **disabled** in `apps/api/eslint.config.js` (it breaks NestJS DI metadata).
- `declaration` stays **off** in `apps/api` and `apps/web` tsconfigs.
- `apps/web` uses **extensionless** relative imports; `apps/api` uses **`.js`** extensions on relative imports (NodeNext).
- `apps/api/src/main.ts` must keep `import 'dotenv/config'` as the **first** import.
- Prisma manages the **`public`** schema only; the `auth` schema is Supabase-managed. The FK + trigger live in a **raw-SQL migration**.
- The **Data API (PostgREST) is disabled**; **no RLS** is added to `public` tables (the restricted `prisma` role would otherwise be blocked).
- Secrets are never committed and never shipped to the browser except `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. The engineer never types the user's secrets — they come from `.env` files the user populated.
- Pin new dependencies exactly (`pnpm add -E`) and commit the updated `pnpm-lock.yaml`.

---

## Task 0: Prerequisites (blocking — provided by the user)

Not a code task. Before Task 3's live steps can run, these must exist. Confirm they are done; if not, stop and ask the user.

- Supabase project created; **asymmetric JWT signing keys** enabled; **Data API disabled**; **SMTP** configured; **Site URL** = `http://localhost:3000` and redirect URL `http://localhost:3000/` allowlisted; Google provider optional.
- A restricted `prisma` DB role created (per Supabase's Prisma guide).
- `apps/api/.env` contains: `DATABASE_URL` (session pooler, `prisma` role), `DIRECT_URL` (direct/session), `SUPABASE_URL` (e.g. `https://<ref>.supabase.co`), `SUPABASE_SERVICE_ROLE_KEY`. Optional `SUPABASE_JWT_SECRET` only if signing keys were NOT rotated to asymmetric.
- `apps/web/.env` contains: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_URL=http://localhost:4000`.

- [ ] **Step 1: Verify prerequisites**

Run: `cd apps/api && node -e "require('dotenv').config(); console.log(!!process.env.DATABASE_URL, !!process.env.DIRECT_URL, !!process.env.SUPABASE_URL, !!process.env.SUPABASE_SERVICE_ROLE_KEY)"`
Expected: `true true true true`. If any `false`, stop and request the value from the user.

---

## Task 1: Add dependencies and Supabase env config

**Files:**
- Modify: `apps/api/package.json` (deps)
- Modify: `apps/web/package.json` (deps)
- Modify: `apps/api/src/config/env.ts`
- Modify: `.env.example`
- Create: `apps/web/.env.example`

**Interfaces:**
- Produces: `env.supabase = { url, jwksUrl, issuer, serviceRoleKey, jwtSecret }`, `env.directUrl`, `env.webOrigins`, `env.port`, `env.databaseUrl` from `apps/api/src/config/env.ts`.

- [ ] **Step 1: Add API deps, remove Better Auth + nodemailer**

Run:
```bash
pnpm --filter @bleachers/api remove better-auth nodemailer
pnpm --filter @bleachers/api add -E jose @supabase/supabase-js
```

- [ ] **Step 2: Add web dep, remove Better Auth**

Run:
```bash
pnpm --filter @bleachers/web remove better-auth
pnpm --filter @bleachers/web add -E @supabase/supabase-js
```

- [ ] **Step 3: Rewrite `apps/api/src/config/env.ts`**

```ts
/** Centralised, typed access to environment configuration. */
export interface AppEnv {
  nodeEnv: string;
  port: number;
  databaseUrl: string;
  directUrl: string;
  webOrigins: string[];
  supabase: {
    url: string;
    jwksUrl: string;
    issuer: string;
    serviceRoleKey: string;
    /** Only set when the project still uses the legacy HS256 shared secret. */
    jwtSecret: string | null;
  };
}

export function loadEnv(): AppEnv {
  const supabaseUrl = (process.env.SUPABASE_URL ?? '').replace(/\/$/, '');
  return {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: Number(process.env.API_PORT ?? '4000'),
    databaseUrl: process.env.DATABASE_URL ?? '',
    directUrl: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '',
    webOrigins: (process.env.WEB_ORIGIN ?? 'http://localhost:3000')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    supabase: {
      url: supabaseUrl,
      jwksUrl: `${supabaseUrl}/auth/v1/.well-known/jwks.json`,
      issuer: `${supabaseUrl}/auth/v1`,
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
      jwtSecret: process.env.SUPABASE_JWT_SECRET ?? null,
    },
  };
}

export const env = loadEnv();
```

- [ ] **Step 4: Update `.env.example` (API section)**

Replace any `BETTER_AUTH_*`, `SMTP_*`, `GOOGLE_*`, and `EMAIL_FROM` lines with:
```dotenv
# --- apps/api/.env ---
DATABASE_URL="postgres://prisma.<ref>:<password>@<region>.pooler.supabase.com:5432/postgres"
DIRECT_URL="postgres://prisma.<ref>:<password>@<region>.pooler.supabase.com:5432/postgres"
SUPABASE_URL="https://<ref>.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
# Optional: only if the project uses the legacy HS256 JWT secret instead of signing keys
# SUPABASE_JWT_SECRET="<legacy-jwt-secret>"
API_PORT=4000
WEB_ORIGIN=http://localhost:3000
```

- [ ] **Step 5: Create `apps/web/.env.example`**

```dotenv
NEXT_PUBLIC_SUPABASE_URL="https://<ref>.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="<anon-or-publishable-key>"
NEXT_PUBLIC_API_URL="http://localhost:4000"
```

- [ ] **Step 6: Typecheck both apps still compile (env.ts has no remaining Better Auth references)**

Run: `pnpm --filter @bleachers/api typecheck`
Expected: PASS. (Guard/auth still reference Better Auth — that is fixed in Task 3. If typecheck fails only due to `env.betterAuth*`/`env.google`/`env.smtp`, that is expected and resolved in Task 3; proceed.)

- [ ] **Step 7: Commit**

```bash
git add apps/api/package.json apps/web/package.json apps/api/src/config/env.ts .env.example apps/web/.env.example pnpm-lock.yaml
git commit -m "chore: add supabase-js/jose, drop better-auth/nodemailer, supabase env config"
```

---

## Task 2: Supabase JWT verifier (JWKS) with unit tests

**Files:**
- Create: `apps/api/src/auth/supabase-jwt.ts`
- Create: `apps/api/test/supabase-jwt.spec.ts`

**Interfaces:**
- Produces:
  - `interface VerifiedUser { id: string; email: string | null; name: string | null; image: string | null }`
  - `interface JwtVerifier { verify(token: string): Promise<VerifiedUser> }`
  - `function createSupabaseJwtVerifier(opts: { jwksUrl: string; issuer: string; audience?: string; keyResolver?: (protectedHeader: unknown, token: unknown) => Promise<CryptoKey | Uint8Array> }): JwtVerifier`

- [ ] **Step 1: Write the failing test `apps/api/test/supabase-jwt.spec.ts`**

```ts
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

async function sign(privateKey: CryptoKey, claims: Record<string, unknown>, opts?: { aud?: string; exp?: string }) {
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @bleachers/api exec vitest run test/supabase-jwt.spec.ts`
Expected: FAIL (cannot find module `../src/auth/supabase-jwt`).

- [ ] **Step 3: Implement `apps/api/src/auth/supabase-jwt.ts`**

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @bleachers/api exec vitest run test/supabase-jwt.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/auth/supabase-jwt.ts apps/api/test/supabase-jwt.spec.ts
git commit -m "feat(api): local Supabase JWT verifier (JWKS) with tests"
```

---

## Task 3: API auth backend cutover (JWKS guard, remove Better Auth)

**Files:**
- Modify: `apps/api/src/auth/auth.types.ts`
- Modify: `apps/api/src/auth/auth.guard.ts`
- Modify: `apps/api/src/auth/auth.module.ts`
- Modify: `apps/api/src/main.ts`
- Delete: `apps/api/src/auth/auth.instance.ts`, `apps/api/src/auth/email.ts`

**Interfaces:**
- Consumes: `createSupabaseJwtVerifier`, `JwtVerifier`, `VerifiedUser` (Task 2); `env.supabase` (Task 1).
- Produces: DI token `JWT_VERIFIER`; `AuthUser = VerifiedUser`; `request.user: AuthUser`. `@Public()` and `@CurrentUser()` unchanged.

- [ ] **Step 1: Rewrite `apps/api/src/auth/auth.types.ts`**

```ts
import type { VerifiedUser } from './supabase-jwt.js';

/** The authenticated principal attached to the request by AuthGuard. */
export type AuthUser = VerifiedUser;
```

- [ ] **Step 2: Rewrite `apps/api/src/auth/auth.guard.ts`**

```ts
import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './auth.decorators.js';
import { JWT_VERIFIER } from './auth.tokens.js';
import type { JwtVerifier } from './supabase-jwt.js';

/**
 * Global guard. Verifies the Supabase access token from the Authorization: Bearer
 * header and attaches the user to the request. Routes marked `@Public()` bypass it.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(JWT_VERIFIER) private readonly verifier: JwtVerifier,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const header: string = request.headers['authorization'] ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new UnauthorizedException('Authentication required');

    try {
      request.user = await this.verifier.verify(token);
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
```

- [ ] **Step 3: Create `apps/api/src/auth/auth.tokens.ts`**

```ts
/** DI token for the Supabase JWT verifier. */
export const JWT_VERIFIER = Symbol('JWT_VERIFIER');
```

- [ ] **Step 4: Rewrite `apps/api/src/auth/auth.module.ts`**

```ts
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
```

- [ ] **Step 5: Rewrite `apps/api/src/main.ts`**

```ts
import 'reflect-metadata';
import 'dotenv/config';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { env } from './config/env.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.enableCors({
    origin: env.webOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.setGlobalPrefix('api', { exclude: ['health'] });

  await app.listen(env.port);
  new Logger('Bootstrap').log(`Bleachers API listening on http://localhost:${env.port}`);
}

void bootstrap();
```

- [ ] **Step 6: Delete the Better Auth files**

Run: `git rm apps/api/src/auth/auth.instance.ts apps/api/src/auth/email.ts`

- [ ] **Step 7: Typecheck the API**

Run: `pnpm --filter @bleachers/api typecheck`
Expected: PASS. (If it fails referencing `prisma.user` in the seed/integration test, that is fixed in Task 4 — but those are `.ts` compiled separately; the `src` build must pass here.)

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/auth apps/api/src/main.ts
git commit -m "feat(api): verify Supabase JWTs in AuthGuard; remove Better Auth"
```

---

## Task 4: Prisma schema cutover to `profiles` + trigger migration + seed rework

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Delete: existing dirs under `apps/api/prisma/migrations/`
- Create: fresh baseline migration (generated) + `apps/api/prisma/migrations/<ts>_supabase_auth_link/migration.sql` (hand-authored)
- Modify: `apps/api/prisma/seed.ts`

**Interfaces:**
- Consumes: `env.supabase.serviceRoleKey`, `env.supabase.url` (Task 1).
- Produces: Prisma model `Profile` (table `profiles`); Prisma client accessor `prisma.profile`.

- [ ] **Step 1: Edit the datasource in `apps/api/prisma/schema.prisma`**

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

- [ ] **Step 2: Replace the `User` model and delete `Session`/`Account`/`Verification`**

Replace the `model User { ... }` block with:
```prisma
model Profile {
  id        String   @id @db.Uuid
  email     String   @unique
  name      String   @default("")
  image     String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Domain back-references (ownership / audit).
  createdPlayers      Player[]          @relation("PlayerCreatedBy")
  createdTeams        Team[]            @relation("TeamCreatedBy")
  createdMatches      Match[]           @relation("MatchCreatedBy")
  recordedEvents      Event[]           @relation("EventRecordedBy")
  voidedEvents        Event[]           @relation("EventVoidedBy")
  permissionGrants    PermissionGrant[]
  createdCompetitions Competition[]     @relation("CompetitionCreatedBy")

  @@map("profiles")
}
```
Then delete the entire `model Session { ... }`, `model Account { ... }`, and `model Verification { ... }` blocks.

- [ ] **Step 3: Repoint the relation names from `User` to `Profile`**

In every domain model, change the relation field type `User` → `Profile` (relation names stay the same). For example in `Player`:
```prisma
  createdBy   Profile  @relation("PlayerCreatedBy", fields: [createdById], references: [id])
```
Apply the same `User` → `Profile` change in `Team.createdBy`, `Match.createdBy`, `Event.recordedBy`, `Event.voidedBy`, `PermissionGrant.user`, and `Competition.createdBy`. Change the `createdById`/`recordedById`/`voidedById`/`userId` scalar columns to `@db.Uuid` if not already, so they match `profiles.id`.

- [ ] **Step 4: Validate the schema**

Run: `pnpm --filter @bleachers/api exec prisma validate`
Expected: "The schema at prisma/schema.prisma is valid 🚀".

- [ ] **Step 5: Generate a fresh baseline migration WITHOUT a shadow database**

`prisma migrate dev` needs a shadow DB the restricted `prisma` role can't create on Supabase, so generate the baseline SQL offline with `migrate diff` instead:
```bash
rm -rf apps/api/prisma/migrations
mkdir -p apps/api/prisma/migrations/00000000000000_init
printf '# Please do not edit this file manually\nprovider = "postgresql"\n' > apps/api/prisma/migrations/migration_lock.toml
pnpm --filter @bleachers/api exec prisma migrate diff \
  --from-empty \
  --to-schema-datamodel prisma/schema.prisma \
  --script > apps/api/prisma/migrations/00000000000000_init/migration.sql
```
Confirm the file contains `CREATE TABLE "profiles"` and no `session`/`account`/`verification` tables.

- [ ] **Step 6: Add the hand-authored FK + trigger migration**

Create `apps/api/prisma/migrations/00000000000001_supabase_auth_link/migration.sql` (the numeric prefix sorts it after `init`):
```sql
-- Link profiles to Supabase auth.users and auto-create a profile row on signup.
alter table public.profiles
  add constraint profiles_id_fkey
  foreign key (id) references auth.users (id) on delete cascade;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, name, image, "createdAt", "updatedAt")
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', ''),
    new.raw_user_meta_data->>'avatar_url',
    now(), now()
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```
Confirm ordering: `ls apps/api/prisma/migrations` lists `00000000000000_init` before `00000000000001_supabase_auth_link`.

- [ ] **Step 7: Apply migrations to Supabase and regenerate the client**

Run:
```bash
pnpm --filter @bleachers/api exec prisma migrate deploy
pnpm --filter @bleachers/api exec prisma generate
```
Expected: both migrations report as applied; client generated. Then confirm state:
```bash
pnpm --filter @bleachers/api exec prisma migrate status
```
Expected: "Database schema is up to date!"

- [ ] **Step 8: Rewrite `apps/api/prisma/seed.ts`**

```ts
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';

const prisma = new PrismaClient();
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DEMO_EMAIL = 'demo@bleachers.app';

/** Create-or-find the demo auth user; the DB trigger creates its profile row. */
async function ensureDemoUser(): Promise<string> {
  const { data: list, error: listErr } = await admin.auth.admin.listUsers();
  if (listErr) throw listErr;
  const existing = list.users.find((u) => u.email === DEMO_EMAIL);
  if (existing) return existing.id;

  const { data, error } = await admin.auth.admin.createUser({
    email: DEMO_EMAIL,
    email_confirm: true,
    user_metadata: { name: 'Demo' },
  });
  if (error) throw error;
  return data.user.id;
}

async function main() {
  const userId = await ensureDemoUser();
  // The rest of the seed is unchanged except every `DEMO_USER_ID` becomes `userId`.
  // (Reuse the existing team/roster/player/match seeding logic below, passing
  //  createdById: userId / recordedById: userId.)
  // ...existing seeding body, with DEMO_USER_ID replaced by userId...
  console.log('✅ Seed complete: demo teams, rosters, and a live match are ready.');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
```
Then in the existing seeding body, delete the `prisma.user.upsert(...)` block entirely and replace every `DEMO_USER_ID` reference with `userId`.

- [ ] **Step 9: Run the seed against Supabase**

Run: `pnpm db:seed`
Expected: `✅ Seed complete: demo teams, rosters, and a live match are ready.` Re-run once more; it must succeed idempotently (demo user found, upserts no-op).

- [ ] **Step 10: Typecheck**

Run: `pnpm --filter @bleachers/api typecheck`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add apps/api/prisma
git commit -m "feat(api): profiles model + auth.users trigger; seed via Supabase admin"
```

---

## Task 5: Web Supabase client + Bearer-token API wrapper

**Files:**
- Create: `apps/web/src/lib/supabase.ts`
- Modify: `apps/web/src/lib/api.ts`
- Create: `apps/web/src/lib/api.test.ts`

**Interfaces:**
- Produces: `supabase` browser client; `api()`/`apiGet`/`apiPost`/`apiPatch`/`apiDelete` now attach `Authorization: Bearer <token>`.

- [ ] **Step 1: Create `apps/web/src/lib/supabase.ts`**

```ts
'use client';

import { createClient } from '@supabase/supabase-js';

/** Browser Supabase client. Persists the session and parses magic-link/OAuth callbacks. */
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } },
);
```

- [ ] **Step 2: Write the failing test `apps/web/src/lib/api.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getSession = vi.fn();
vi.mock('./supabase', () => ({ supabase: { auth: { getSession } } }));

import { apiGet } from './api';

describe('api() bearer token', () => {
  beforeEach(() => {
    getSession.mockReset();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })),
    );
  });

  it('attaches the Supabase access token as a Bearer header', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: 'tok-123' } } });
    await apiGet('/api/me');
    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok-123');
  });

  it('omits the header when there is no session', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    await apiGet('/api/me');
    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @bleachers/web exec vitest run src/lib/api.test.ts`
Expected: FAIL (api still uses cookies, no Authorization header).

- [ ] **Step 4: Rewrite `apps/web/src/lib/api.ts`**

```ts
import { supabase } from './supabase';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Thin fetch wrapper. Attaches the Supabase access token as a Bearer header and JSON.
 * Throws ApiError on non-2xx so TanStack Query can surface errors uniformly.
 */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });

  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = await res.text().catch(() => undefined);
    }
    const message = (body as { message?: string })?.message ?? `Request failed (${res.status})`;
    throw new ApiError(res.status, message, body);
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const apiGet = <T>(path: string) => api<T>(path);
export const apiPost = <T>(path: string, data?: unknown) =>
  api<T>(path, { method: 'POST', body: data === undefined ? undefined : JSON.stringify(data) });
export const apiPatch = <T>(path: string, data?: unknown) =>
  api<T>(path, { method: 'PATCH', body: JSON.stringify(data) });
export const apiDelete = <T>(path: string) => api<T>(path, { method: 'DELETE' });
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @bleachers/web exec vitest run src/lib/api.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/supabase.ts apps/web/src/lib/api.ts apps/web/src/lib/api.test.ts
git commit -m "feat(web): supabase browser client; attach Bearer token to API calls"
```

---

## Task 6: Web auth screens cutover (session hook, login, gate, header)

**Files:**
- Rewrite: `apps/web/src/lib/auth-client.ts`
- Modify: `apps/web/src/app/login/page.tsx`
- Modify: `apps/web/src/components/auth-gate.tsx` (import only — API is unchanged)
- Modify: `apps/web/src/components/page-header.tsx` (import only — API is unchanged)

**Interfaces:**
- Consumes: `supabase` (Task 5).
- Produces: `useSession(): { data: { user: { id: string; email: string; name: string | null; image: string | null } } | null; isPending: boolean }`; `signOut(): Promise<unknown>`. Same shape the existing components consume (`data?.user.email`, `isPending`).

- [ ] **Step 1: Rewrite `apps/web/src/lib/auth-client.ts`**

```ts
'use client';

import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

export interface AppSession {
  user: { id: string; email: string; name: string | null; image: string | null };
}

function toAppSession(session: Session | null): AppSession | null {
  if (!session) return null;
  const u = session.user;
  const meta = (u.user_metadata ?? {}) as { name?: string; full_name?: string; avatar_url?: string };
  return {
    user: {
      id: u.id,
      email: u.email ?? '',
      name: meta.name ?? meta.full_name ?? null,
      image: meta.avatar_url ?? null,
    },
  };
}

/** Mirrors the previous Better Auth hook shape so consumers need no changes. */
export function useSession(): { data: AppSession | null; isPending: boolean } {
  const [data, setData] = useState<AppSession | null>(null);
  const [isPending, setIsPending] = useState(true);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return;
      setData(toAppSession(session));
      setIsPending(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setData(toAppSession(session));
      setIsPending(false);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { data, isPending };
}

export const signOut = () => supabase.auth.signOut();
```

- [ ] **Step 2: Update the login handlers in `apps/web/src/app/login/page.tsx`**

Remove the `import { authClient } from '@/lib/auth-client';` line and add `import { supabase } from '@/lib/supabase';`. Replace `sendMagicLink`'s body:
```ts
  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setStatus('sending');
    setError('');
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/` },
    });
    if (error) {
      setStatus('error');
      setError(error.message ?? 'Could not send the link');
    } else {
      setStatus('sent');
    }
  }
```
Replace the Google button `onClick` with:
```ts
                onClick={() =>
                  supabase.auth.signInWithOAuth({
                    provider: 'google',
                    options: { redirectTo: `${window.location.origin}/` },
                  })
                }
```

- [ ] **Step 3: Confirm `auth-gate.tsx` and `page-header.tsx` still typecheck**

No code change needed — both import `useSession`/`signOut` from `@/lib/auth-client`, whose shape is preserved. (The magic-link "sent" copy already says "printed to the API console" — update that line in `login/page.tsx` to: `In dev, the link is emailed to you (SMTP configured in Supabase).`)

- [ ] **Step 4: Typecheck + run the web unit tests**

Run: `pnpm --filter @bleachers/web typecheck && pnpm --filter @bleachers/web exec vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/auth-client.ts apps/web/src/app/login/page.tsx
git commit -m "feat(web): Supabase Auth for magic link + Google; session hook"
```

---

## Task 7: Scripts, docs, and memory

**Files:**
- Modify: `package.json` (root scripts)
- Modify: `README.md`
- Modify: `docker-compose.yml` (comment only)
- Modify: `C:/Users/theol/.claude/projects/C--Users-theol-Documents-work-bleachers/memory/bleachers-project.md`

- [ ] **Step 1: Update root `package.json` db scripts**

Set:
```json
    "db:migrate": "pnpm --filter @bleachers/api exec prisma migrate deploy",
    "db:migrate:dev": "pnpm --filter @bleachers/api exec prisma migrate dev",
    "db:generate": "pnpm --filter @bleachers/api exec prisma generate",
    "db:seed": "pnpm --filter @bleachers/api exec prisma db seed",
```
Keep `db:up`/`db:down` as-is (optional Docker fallback).

- [ ] **Step 2: Update `README.md` quick start**

Replace the "Database (Postgres via Docker)" section with:
```markdown
## Quick start

1. `pnpm install`
2. Create a Supabase project and populate `apps/api/.env` and `apps/web/.env` (see `.env.example` and `apps/web/.env.example`).
3. `pnpm db:migrate` — apply schema to Supabase
4. `pnpm db:seed` — demo teams, players, a live match (owned by demo@bleachers.app)
5. `pnpm dev` — api on :4000, web on :3000

Sign in at http://localhost:3000 with a magic link (emailed via the SMTP you configured in Supabase). `docker-compose.yml` remains as an optional local-Postgres fallback (`pnpm db:up`).
```

- [ ] **Step 3: Add a comment atop `docker-compose.yml`**

Prepend: `# Optional local-Postgres fallback. Day-to-day dev uses hosted Supabase; see README.`

- [ ] **Step 4: Update the project memory note**

Edit `bleachers-project.md`: change the auth/DB sentences to state that Postgres is **hosted on Supabase** (session pooler; `directUrl` for migrations), auth is **Supabase Auth** (magic link + Google) verified in the API via **JWKS Bearer tokens**, domain rows reference a **`profiles`** table auto-created by a trigger on `auth.users`, and the **Data API is disabled**. Remove the Better Auth / Docker-first lines. Leave `MEMORY.md` untouched.

- [ ] **Step 5: Commit**

```bash
git add package.json README.md docker-compose.yml
git commit -m "docs: Supabase-based dev workflow; scripts retarget Supabase"
```

---

## Task 8: Test rework + full verification gate

**Files:**
- Create: `apps/api/test/helpers/auth.ts`
- Modify: `apps/api/test/events.integration.spec.ts`
- Modify: `apps/web/tests-e2e/auth.spec.ts`

**Interfaces:**
- Consumes: `env`-style `process.env.SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`.
- Produces: `createTestUser(): Promise<string>`, `deleteTestUser(id: string): Promise<void>`.

- [ ] **Step 1: Create `apps/api/test/helpers/auth.ts`**

```ts
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Creates a confirmed Supabase auth user; the DB trigger creates its profile. */
export async function createTestUser(): Promise<string> {
  const email = `test-${randomUUID()}@bleachers.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error) throw error;
  return data.user.id;
}

export async function deleteTestUser(id: string): Promise<void> {
  await admin.auth.admin.deleteUser(id);
}
```

- [ ] **Step 2: Update `apps/api/test/events.integration.spec.ts`**

At the top add: `import { createTestUser, deleteTestUser } from './helpers/auth';`
Replace the `const userId = \`test-user-${randomUUID()}\`;` line with `let userId = '';`.
In `beforeAll`, replace the `await prisma.user.create({ ... })` block with `userId = await createTestUser();`.
In `afterAll`, after the existing domain-data cleanup (events → matches → players → teams), add `await deleteTestUser(userId);` as the final step (its cascade removes the profile).

- [ ] **Step 3: Run the integration test (live — needs Supabase env)**

Run: `pnpm --filter @bleachers/api test`
Expected: PASS (existing record→derive/idempotency/undo/career assertions, now with a real auth user).

- [ ] **Step 4: Update `apps/web/tests-e2e/auth.spec.ts`**

Keep the first test (redirect to `/login`) unchanged. In the second test, update the trailing comment to `// Supabase accepts the OTP request; the email is delivered via configured SMTP.` and keep the `Check your email` assertion. (Uses a `@bleachers.app` test address so real inboxes aren't spammed.)

- [ ] **Step 5: Full verification gate**

Run each and confirm PASS:
```bash
pnpm format:check
pnpm typecheck
pnpm --filter @bleachers/api test
pnpm --filter @bleachers/web test
```
(`pnpm lint` if the ESLint binary resolves; if not, run `pnpm install` first.)

- [ ] **Step 6: Live smoke test**

Start the stack (`pnpm dev`), then: sign in as `demo@bleachers.app` via the emailed magic link; confirm the dashboard shows the seeded live match; open the match, record a goal, undo it; confirm an unauthenticated `curl http://localhost:4000/api/matches` returns `401`.

- [ ] **Step 7: Commit**

```bash
git add apps/api/test apps/web/tests-e2e/auth.spec.ts
git commit -m "test: create auth users via Supabase admin; update auth e2e"
```

---

## Done criteria

- No `better-auth` / `nodemailer` anywhere; `grep -rniE "better-auth|betterAuth" apps` returns nothing.
- API boots with no `/api/auth/*` handler; protected routes require a valid Supabase Bearer token; `@Public()` routes still open.
- `pnpm db:migrate && pnpm db:seed && pnpm dev` works against Supabase with no Docker running.
- Format, typecheck, unit + integration tests, and the live smoke all pass.
