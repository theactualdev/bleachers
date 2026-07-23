# Migrate Bleachers to Supabase (Postgres + Auth)

**Status:** Approved design · 2026-07-23
**Scope:** Replace local Docker Postgres with hosted Supabase Postgres, and replace Better Auth with Supabase Auth. Keep the NestJS API as the sole data and authorization layer.

## Context

Bleachers currently runs Postgres via local Docker (`docker compose up -d db`) and authenticates with **Better Auth** mounted inside the NestJS API at `/api/auth/*` (magic link + optional Google), backed by Prisma-managed `user`/`session`/`account`/`verification` tables. Every domain row foreign-keys to `user.id`. The web app is a `better-auth/react` client; in dev the magic link is printed to the API console.

Two frustrations motivate this change: local Docker is slow to start on this machine, and the team wants Supabase's managed auth. The database is still development-only — seeded demo data, **no production data, no meaningful git history** — so we can reset schema and migrations freely.

## Goals

- Postgres hosted on Supabase (cloud); no local Docker required for day-to-day dev.
- Authentication provided by Supabase Auth (magic link + optional Google), replacing Better Auth entirely.
- The NestJS API remains the only thing that talks to the database (via Prisma) and remains responsible for authorization. The web app never queries Supabase data directly.
- Preserve the event-sourcing domain model and all existing ownership/audit foreign keys with minimal churn.

## Non-goals (explicitly out of scope)

- Moving data access to the Supabase client / PostgREST / RLS-enforced direct access from the web. The API stays in charge.
- Row Level Security as the primary authorization mechanism (see Security).
- Migrating any existing users or data (there is none worth keeping).
- Changing any domain feature, endpoint contract, or the sport-engine.

## Locked decisions

1. **SMTP** configured in Supabase Auth for magic-link delivery (provider TBD — Resend or Mailtrap; credentials entered by the user in the dashboard).
2. **Profiles table** identity model: repurpose `user` → `profiles`, keyed by the Supabase auth UUID, auto-created by a trigger.
3. **JWT verification via JWKS** (local, no per-request network hop) in the API guard.
4. **Reset migrations** to a fresh Prisma baseline (dev data is disposable).
5. NestJS keeps authorization; web sends the Supabase access token as a **Bearer** header to the API.
6. **Disable the Supabase Data API (PostgREST)**; access the DB only through Prisma.

## Architecture: stays vs. changes

**Unchanged:** NestJS + Prisma as the data/authorization layer; the full event-sourcing model; `@Public()` and `@CurrentUser()` decorators and therefore every controller/service; React Query on the web; the decoupled web(:3000)/API(:4000) origins; the public match pages.

**Changed:** Postgres location; auth backend (Better Auth → Supabase Auth); web auth client; the `AuthGuard` internals; user-identity plumbing (profiles + trigger); the seed; env/config/scripts/docs; auth-related tests.

## Detailed design

### 1. Identity & data model

- Rename the Prisma model `User` → `Profile`, mapped to table **`profiles`**. Fields: `id` (`uuid`, **no default** — supplied by Supabase auth), `email`, `name`, `image`, `createdAt`, `updatedAt`. Drop `emailVerified` (Supabase owns verification).
- **Drop** the `Session`, `Account`, and `Verification` models/tables — Supabase owns sessions, OAuth accounts, and verification.
- All existing ownership/audit relations keep pointing at `Profile` unchanged: `Player.createdById`, `Team.createdById`, `Match.createdById`, `Event.recordedById`, `Event.voidedById`, `PermissionGrant.userId`, `Competition.createdById`.
- A trigger keeps `profiles` in sync with `auth.users`. Added via a **raw-SQL Prisma migration** (Prisma continues to manage only the `public` schema; the `auth` schema is Supabase-managed):

  ```sql
  -- profiles.id references the Supabase auth user; cascade on user deletion.
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

  -- The function is invoked only by the trigger; do not expose it as a callable endpoint.
  revoke execute on function public.handle_new_user() from public, anon, authenticated;

  create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();
  ```

  (Column identifiers must match Prisma's generated casing, hence the quoted `"createdAt"`/`"updatedAt"`.)

### 2. Web auth (`@supabase/supabase-js`)

- Replace `apps/web/src/lib/auth-client.ts` with a Supabase **browser client** (`createClient` with `persistSession: true`, `detectSessionInUrl: true`). No `@supabase/ssr`/middleware — there are no authenticated server components (the only server component, the public match page, is unauthenticated).
- Auth actions: `signInWithOtp({ email, options: { emailRedirectTo } })` for magic link; `signInWithOAuth({ provider: 'google' })` kept optional; `signOut()`.
- `AuthGate` subscribes to `onAuthStateChange` / reads `getSession()` instead of `useSession()`. The login page and header sign-out are updated to the new client. A tiny `useSession`-equivalent hook wraps Supabase session state so component changes stay minimal.
- Magic-link / OAuth redirect returns to the app URL; the browser client auto-detects the session from the callback URL. Site URL + redirect allowlist are configured in the dashboard.
- `apps/web/src/lib/api.ts` attaches `Authorization: Bearer <access_token>` (from the current Supabase session) to every request and stops relying on `credentials: 'include'` cookies.

### 3. API auth (JWKS verification)

- `AuthGuard` is rewritten to: read the `Authorization: Bearer` token, verify it **locally against the project JWKS** using `jose` (`createRemoteJWKSet` + `jwtVerify`, cached), checking issuer `https://<ref>.supabase.co/auth/v1` and audience `authenticated`, then attach `request.user = { id: sub, email, name, image }`. `@Public()` bypass and `@CurrentUser()` are unchanged, so controllers/services need no edits.
- Requires the project to use **asymmetric JWT signing keys** (so the JWKS endpoint serves the verification key). A dashboard step enables/rotates to signing keys. A documented fallback: if the project stays on the legacy HS256 shared secret, verify with `SUPABASE_JWT_SECRET` instead — the guard supports one path, chosen by which env vars are present.
- Remove the Better Auth instance, the mounted `/api/auth/*` handler in `main.ts`, `auth.instance.ts`, `email.ts`, and the `better-auth` dependency. `/api/me` and the guard's public contract are unchanged.

### 4. Database connection & security

- Prisma datasource gains `directUrl`:
  ```prisma
  datasource db {
    provider  = "postgresql"
    url       = env("DATABASE_URL")   // Supavisor session pooler (IPv4-friendly)
    directUrl = env("DIRECT_URL")     // used by prisma migrate
  }
  ```
- `DATABASE_URL` = Supabase **session-pooler** string (port 5432, `prisma` role). `DIRECT_URL` = direct/session connection for migrations.
- **Security model:** the DB is reached only through Prisma with a restricted `prisma` role; the **Data API (PostgREST) is disabled**, so `public` tables are not web-exposed. RLS is therefore **not required** and is intentionally **not enabled on `public` tables**, because the `prisma` app role would otherwise be blocked by RLS unless granted `BYPASSRLS`. If the Data API is ever re-enabled, RLS must be added _and_ the `prisma` role granted `BYPASSRLS` (or made table owner) so API queries keep working. `service_role` and JWT secrets never ship to the browser (only `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` are public).

### 5. Seed & migrations

- **Reset** the Prisma migration history to a single fresh baseline matching the new schema (drop `session`/`account`/`verification`, `user`→`profiles`), plus the raw-SQL migration for the FK + trigger.
- The seed script (`apps/api/prisma/seed.ts`) is reworked: using `@supabase/supabase-js` with the **service-role key**, create-or-find `demo@bleachers.app` (email confirmed) via the admin API to obtain its UUID (the trigger creates the profile), then seed the demo teams, rosters, players, and the live match owned by that UUID. Requires `SUPABASE_SERVICE_ROLE_KEY` in the API env. Sign in as `demo@bleachers.app` to see the seeded data.

### 6. Config / scripts / docs

- **API `apps/api/.env`:** add `DATABASE_URL`, `DIRECT_URL`, `SUPABASE_URL`, `SUPABASE_JWKS_URL` (derived from project ref), `SUPABASE_SERVICE_ROLE_KEY` (seed only), optional `SUPABASE_JWT_SECRET` (HS256 fallback). Remove `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, Google client vars migrate to the dashboard.
- **Web `apps/web/.env`:** add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Keep `NEXT_PUBLIC_API_URL`.
- Update `.env.example` for both apps.
- Root scripts: `db:up`/`db:down` no longer part of the normal flow (kept for the optional offline Docker fallback); `db:migrate` and `db:seed` retarget Supabase. README quick-start updated to the Supabase flow (create project → set env → `pnpm db:migrate` → `pnpm db:seed` → `pnpm dev`). `docker-compose.yml` retained but no longer required.
- Update the project memory note about the stack (Better Auth → Supabase Auth; Docker → Supabase).

### 7. Testing impact

- API integration tests (`apps/api`) and the Playwright auth E2E (`apps/web/tests-e2e/auth.spec.ts`) assume Better Auth. Rework:
  - API tests: provide a test helper that mints a valid JWT the guard accepts (sign with a test key whose JWKS/secret the guard is pointed at in the test env), or a guard override in the testing module. Keep the existing record→derive/undo/idempotency assertions.
  - E2E: update the auth redirect test to the Supabase flow (or stub the session), keeping the public-match E2E as-is.
- Verification gate to re-green: format, lint, typecheck, unit/integration tests, and a live smoke of magic-link sign-in → create match → record/undo against Supabase.

### 8. Dependencies

- **Add:** web `@supabase/supabase-js`; API `jose` and `@supabase/supabase-js` (admin client for the seed). Pin versions and commit the lockfile.
- **Remove:** `better-auth` from both apps.

## What only the user can do (Supabase dashboard / secrets)

1. Create the Supabase project (region close to the user).
2. Create the restricted `prisma` database role (per Supabase's Prisma guide) and copy the session-pooler + direct connection strings.
3. Enable **asymmetric JWT signing keys**.
4. Configure **SMTP** for Auth emails; set **Site URL** and **redirect URLs**; enable **Google** provider (optional).
5. **Disable the Data API (PostgREST)**.
6. Paste connection strings and keys into `apps/api/.env` and `apps/web/.env` (Claude never handles these secrets).

## Risks & edge cases

- **Signing algorithm mismatch:** if signing keys aren't rotated to asymmetric, JWKS verification fails — mitigated by the documented HS256 `SUPABASE_JWT_SECRET` fallback.
- **Free-tier email rate limits / project pausing:** SMTP addresses the email limits; the project may pause after inactivity and need unpausing.
- **Trigger column casing:** the trigger SQL must match Prisma's generated column identifiers exactly (quoted camelCase) — verified during implementation.
- **Local-dev latency:** queries now hit the cloud; acceptable for this app, and the optional Docker fallback remains.

## Rollout order (high level; detailed steps come from the implementation plan)

1. Prisma schema + reset migration + raw-SQL FK/trigger migration.
2. API auth guard (JWKS) + remove Better Auth + env/config.
3. Web Supabase client + login/AuthGate/api.ts + env.
4. Seed rework (service-role admin).
5. Scripts/docs/memory + dependency changes.
6. Test rework + full verification gate.
