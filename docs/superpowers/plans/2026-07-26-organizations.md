# Organizations (Multi-User Tenancy) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Bleachers from per-user ownership to organization tenancy: teams/players/matches/competitions belong to an org; users hold OWNER/SCORER/VIEWER memberships; invite links; opt-in public org profiles; existing data migrated into auto-created personal orgs.

**Architecture:** New `Organization` / `OrgMembership` / `OrgInvite` Prisma models; every domain row gains a required `organizationId`; `PermissionGrant`/`PermissionScope` are dropped. A global `MembershipService.assertMember(userId, orgId, minRole)` replaces `assertOwner`/`assertCanScore`. Collection routes read the active org from the `X-Organization-Id` header via a `@CurrentOrgId()` decorator; detail routes resolve the org from the row. The signup trigger also creates a personal org + OWNER membership. Web keeps an active-org id in a persisted zustand store; `api()` sends the header; React Query keys are org-prefixed. Spec: `docs/superpowers/specs/2026-07-26-organizations-design.md`.

**Tech Stack:** NestJS, Prisma, Supabase (Postgres + Auth admin API), Next.js App Router, React Query, zustand, Vitest, pnpm/Turborepo.

## Global Constraints

- zod stays **v3**; `consistent-type-imports` stays disabled in `apps/api`; `declaration` off in both apps.
- `apps/api` relative imports use `.js` extensions; `apps/web` extensionless.
- Work on branch **`feat/organizations`** off `main`; commit per task with trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` (use `git -c user.name="theactualdev" -c user.email="olayinkacodes@gmail.com" commit ...`).
- **Do not push until the final task** — dev and prod share one database and CI auto-applies migrations; schema + code must land together (spec rollout note).
- Live steps (migrations, seed, integration tests) run against the Supabase project via existing `apps/api/.env`. Never print secret values.
- `apps/api` tsc covers `src/**` only (test/ and prisma/seed.ts excluded); `pnpm --filter @bleachers/api test` runs the integration suites against the live DB.
- Prettier + LF endings enforced (`.gitattributes`); run `pnpm format` on files you author if `format:check` complains.
- The auth admin API intermittently fails (~10%); all admin calls in scripts/tests go through the retrying helpers (`apps/api/test/helpers/auth.ts` pattern).

---

### Task 1: Cleanup sweep of orphaned test users (live)

**Files:**

- Create: `apps/api/scripts/cleanup-test-users.ts`

**Interfaces:**

- Produces: a repo script runnable via `pnpm --filter @bleachers/api exec tsx scripts/cleanup-test-users.ts`. No code interfaces consumed by later tasks (Task 2's migration is defensive regardless).

- [ ] **Step 1: Create the branch**

```bash
git checkout main && git checkout -b feat/organizations
```

- [ ] **Step 2: Write `apps/api/scripts/cleanup-test-users.ts`**

```ts
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PATTERNS = [/@bleachers\.test$/i, /^e2e@bleachers\.app$/i];

async function withRetry<T>(fn: () => Promise<T>, attempts = 6): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      await new Promise((r) => setTimeout(r, 300 * (i + 1) + Math.random() * 300));
    }
  }
  throw lastError;
}

async function main() {
  // Paginate defensively even though the project is small.
  let page = 1;
  const targets: { id: string; email: string }[] = [];
  for (;;) {
    const { data, error } = await withRetry(() =>
      admin.auth.admin.listUsers({ page, perPage: 100 }),
    );
    if (error) throw error;
    for (const u of data.users) {
      const email = u.email ?? '';
      if (PATTERNS.some((p) => p.test(email))) targets.push({ id: u.id, email });
    }
    if (data.users.length < 100) break;
    page++;
  }
  console.log(`Deleting ${targets.length} orphaned test users…`);
  for (const t of targets) {
    await withRetry(async () => {
      const { error } = await admin.auth.admin.deleteUser(t.id);
      if (error) throw error;
    });
    console.log(`  deleted ${t.email}`);
  }
  console.log('✅ cleanup complete');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 3: Run it live and verify**

```bash
pnpm --filter @bleachers/api exec tsx scripts/cleanup-test-users.ts
```

Expected: deletes every `*@bleachers.test` / `e2e@bleachers.app` user, ends `✅ cleanup complete`. Verify no test profiles remain:

```bash
pnpm --filter @bleachers/api exec prisma db execute --stdin <<< "select count(*) from public.profiles where email like '%@bleachers.test' or email = 'e2e@bleachers.app';"
```

Expected count 0 (run via `node` + prisma if `db execute` output is awkward; the integration suites will also implicitly confirm).

- [ ] **Step 4: Commit**

```bash
git add apps/api/scripts/cleanup-test-users.ts
git commit -m "chore(api): admin-API sweep for orphaned test users"
```

---

### Task 2: Schema, migration, signup trigger, seed (live)

**Files:**

- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/00000000000002_organizations/migration.sql`
- Modify: `apps/api/prisma/seed.ts`

**Interfaces:**

- Produces: Prisma models `Organization` (`prisma.organization`), `OrgMembership` (`prisma.orgMembership`), `OrgInvite` (`prisma.orgInvite`); required `organizationId` on `Team`/`Player`/`Match`/`Competition`; `PermissionGrant` model and `PermissionScope` enum GONE (any code referencing `prisma.permissionGrant` breaks until Tasks 4–5 fix it — API `src` typecheck is NOT expected to pass until Task 5).

- [ ] **Step 1: Edit `apps/api/prisma/schema.prisma`**

Add the three models exactly as written in the spec's "New models" section (`docs/superpowers/specs/2026-07-26-organizations-design.md`) — `Organization` (`@@map("organization")`), `OrgMembership` (`@@map("org_membership")`, `@@unique([orgId, userId])`, `@@index([userId])`), `OrgInvite` (`@@map("org_invite")`, unique `token`). Then:

1. On `Team`, `Player`, `Match`, `Competition` add:

```prisma
  organizationId String       @db.Uuid
  organization   Organization @relation(fields: [organizationId], references: [id])
```

and `@@index([organizationId])` in each model's index block. 2. On `Profile` add back-relations: `memberships OrgMembership[]` and remove `permissionGrants PermissionGrant[]`. 3. Delete the whole `model PermissionGrant { ... }` block and the `enum PermissionScope { ... }` block. 4. Run `pnpm --filter @bleachers/api exec prisma validate` → expect "valid".

- [ ] **Step 2: Author `apps/api/prisma/migrations/00000000000002_organizations/migration.sql`**

```sql
-- Organizations tenancy: tables, personal-org backfill, NOT NULL, trigger, cleanup.

create table "organization" (
  "id" uuid primary key default gen_random_uuid(),
  "name" text not null,
  "slug" text not null unique,
  "logo" text,
  "isPublic" boolean not null default false,
  "isPersonal" boolean not null default false,
  "createdById" uuid not null,
  "createdAt" timestamp(3) not null default current_timestamp,
  "updatedAt" timestamp(3) not null
);

create table "org_membership" (
  "id" uuid primary key default gen_random_uuid(),
  "orgId" uuid not null references "organization"("id") on delete cascade,
  "userId" uuid not null references "profiles"("id") on delete cascade,
  "role" "Role" not null,
  "createdAt" timestamp(3) not null default current_timestamp,
  unique ("orgId", "userId")
);
create index "org_membership_userId_idx" on "org_membership"("userId");

create table "org_invite" (
  "id" uuid primary key default gen_random_uuid(),
  "orgId" uuid not null references "organization"("id") on delete cascade,
  "token" text not null unique,
  "role" "Role" not null,
  "createdById" uuid not null,
  "expiresAt" timestamp(3) not null,
  "revokedAt" timestamp(3),
  "createdAt" timestamp(3) not null default current_timestamp
);

-- Nullable first; backfill; then tighten.
alter table "team" add column "organizationId" uuid;
alter table "player" add column "organizationId" uuid;
alter table "match" add column "organizationId" uuid;
alter table "competition" add column "organizationId" uuid;

-- Personal org per existing real profile (defensive skip of test accounts).
insert into "organization" ("id", "name", "slug", "isPersonal", "createdById", "updatedAt")
select gen_random_uuid(),
       coalesce(nullif(p."name", ''), split_part(p."email", '@', 1)) || '''s Club',
       lower(regexp_replace(split_part(p."email", '@', 1), '[^a-zA-Z0-9]+', '-', 'g'))
         || '-' || substr(md5(p."id"::text || clock_timestamp()::text), 1, 6),
       true, p."id", current_timestamp
from "profiles" p
where p."email" not like '%@bleachers.test'
  and not exists (select 1 from "org_membership" m where m."userId" = p."id");

insert into "org_membership" ("orgId", "userId", "role")
select o."id", o."createdById", 'OWNER'::"Role"
from "organization" o
where o."isPersonal"
  and not exists (select 1 from "org_membership" m where m."orgId" = o."id");

-- Stamp existing rows with their creator's personal org.
update "team" t set "organizationId" = o."id"
from "organization" o where o."createdById" = t."createdById" and o."isPersonal" and t."organizationId" is null;
update "player" p set "organizationId" = o."id"
from "organization" o where o."createdById" = p."createdById" and o."isPersonal" and p."organizationId" is null;
update "match" m set "organizationId" = o."id"
from "organization" o where o."createdById" = m."createdById" and o."isPersonal" and m."organizationId" is null;
update "competition" c set "organizationId" = o."id"
from "organization" o where o."createdById" = c."createdById" and o."isPersonal" and c."organizationId" is null;

alter table "team" alter column "organizationId" set not null;
alter table "player" alter column "organizationId" set not null;
alter table "match" alter column "organizationId" set not null;
alter table "competition" alter column "organizationId" set not null;

alter table "team" add constraint "team_organizationId_fkey"
  foreign key ("organizationId") references "organization"("id");
alter table "player" add constraint "player_organizationId_fkey"
  foreign key ("organizationId") references "organization"("id");
alter table "match" add constraint "match_organizationId_fkey"
  foreign key ("organizationId") references "organization"("id");
alter table "competition" add constraint "competition_organizationId_fkey"
  foreign key ("organizationId") references "organization"("id");

create index "team_organizationId_idx" on "team"("organizationId");
create index "player_organizationId_idx" on "player"("organizationId");
create index "match_organizationId_idx" on "match"("organizationId");
create index "competition_organizationId_idx" on "competition"("organizationId");

drop table "permission_grant";
drop type "PermissionScope";

-- Signup now also provisions the personal org + OWNER membership.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  org_id uuid;
  display text;
begin
  insert into public.profiles (id, email, name, image, "createdAt", "updatedAt")
  values (
    new.id, new.email,
    coalesce(new.raw_user_meta_data->>'name', ''),
    new.raw_user_meta_data->>'avatar_url',
    now(), now()
  )
  on conflict (id) do nothing;

  if not exists (select 1 from public.org_membership m where m."userId" = new.id) then
    display := coalesce(nullif(new.raw_user_meta_data->>'name', ''), split_part(new.email, '@', 1));
    insert into public.organization ("name", "slug", "isPersonal", "createdById", "updatedAt")
    values (
      display || '''s Club',
      lower(regexp_replace(split_part(new.email, '@', 1), '[^a-zA-Z0-9]+', '-', 'g'))
        || '-' || substr(md5(new.id::text || clock_timestamp()::text), 1, 6),
      true, new.id, now()
    )
    returning id into org_id;
    insert into public.org_membership ("orgId", "userId", "role")
    values (org_id, new.id, 'OWNER'::"Role");
  end if;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
```

- [ ] **Step 3: Deploy live + drift check**

```bash
pnpm --filter @bleachers/api exec prisma migrate deploy
pnpm --filter @bleachers/api exec prisma generate
pnpm --filter @bleachers/api exec prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --exit-code
```

Expected: migration applied; generate succeeds (stop any local dev server first — Windows DLL lock); the diff command exits **0** (database matches schema — proves the hand-written SQL and the Prisma models agree). If diff is non-empty, fix the migration/schema before proceeding (do NOT hand-edit the live DB outside migrations).

- [ ] **Step 4: Verify trigger + backfill live**

Run with tsx (`pnpm --filter @bleachers/api exec tsx -e "..."`) or a scratch script:

```ts
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
(async () => {
  const orgs = await prisma.organization.findMany({ include: { memberships: true } });
  console.log(
    orgs.map((o) => `${o.name} [personal=${o.isPersonal}] members=${o.memberships.length}`),
  );
  const unstamped = await prisma.$queryRaw`select
    (select count(*) from team where "organizationId" is null) as teams`;
  console.log('unstamped:', unstamped);
  await prisma.$disconnect();
})();
```

Expected: one personal org for the real user with 1 OWNER membership; zero unstamped rows.

- [ ] **Step 5: Update `apps/api/prisma/seed.ts`**

After `const userId = await ensureSeedUser();` add:

```ts
// The signup trigger provisions a personal org; resolve it for stamping seeded rows.
const membership = await prisma.orgMembership.findFirst({
  where: { userId },
  include: { org: true },
});
if (!membership) throw new Error('Seed user has no org membership — trigger missing?');
const orgId = membership.orgId;
```

Then add `organizationId: orgId` to every `create`/`upsert` `data` block for teams, players, and the match. Delete any leftover `permissionGrant` creation if present in the seed.

- [ ] **Step 6: Run the seed twice (idempotency)**

```bash
pnpm db:seed && pnpm db:seed
```

Expected: both runs end with the seed-complete message; second run no-ops cleanly.

- [ ] **Step 7: Commit**

```bash
git add apps/api/prisma
git commit -m "feat(api): organizations schema, backfill migration, signup-trigger org provisioning, org-stamped seed"
```

---

### Task 3: Types + Orgs module (memberships, invites, public profile)

**Files:**

- Create: `packages/types/src/org.ts`; Modify: `packages/types/src/index.ts` (add `export * from './org.js';`)
- Create: `apps/api/src/orgs/orgs.module.ts`, `orgs.service.ts`, `orgs.controller.ts`, `membership.service.ts`, `org.decorators.ts`, `slug.ts`
- Modify: `apps/api/src/app.module.ts` (import `OrgsModule`), `apps/api/src/auth/auth.controller.ts` (memberships in `/me`)
- Create: `apps/api/test/orgs.integration.spec.ts`; Modify: `apps/api/test/helpers/auth.ts` (add `getPersonalOrg`)

**Interfaces:**

- Consumes: Task 2 models.
- Produces (used by Tasks 4–7):
  - `MembershipService.assertMember(userId: string, orgId: string, minRole: OrgRole): Promise<void>` (throws 403/404) and `MembershipService.roleOf(userId, orgId): Promise<OrgRole | null>` — `OrgsModule` is `@Global()`.
  - `@CurrentOrgId()` param decorator → validated header value (400 when missing/malformed).
  - Types: `OrgRole`, `Organization`, `MembershipInfo`, `CreateOrgInput`, `UpdateOrgInput`, `CreateInviteInput` from `@bleachers/types`.
  - Test helper `getPersonalOrg(userId): Promise<string>`.

- [ ] **Step 1: Create `packages/types/src/org.ts`**

```ts
import { z } from 'zod';
import { IdSchema } from './common.js';

export const OrgRoleSchema = z.enum(['OWNER', 'SCORER', 'VIEWER']);
export type OrgRole = z.infer<typeof OrgRoleSchema>;

export const OrganizationSchema = z.object({
  id: IdSchema,
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(60),
  logo: z.string().url().nullable().or(z.string().startsWith('data:').nullable()),
  isPublic: z.boolean(),
  isPersonal: z.boolean(),
  createdById: IdSchema,
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});
export type Organization = z.infer<typeof OrganizationSchema>;

/** Compact membership row embedded in GET /api/me. */
export const MembershipInfoSchema = z.object({
  orgId: IdSchema,
  orgName: z.string(),
  slug: z.string(),
  role: OrgRoleSchema,
  isPersonal: z.boolean(),
});
export type MembershipInfo = z.infer<typeof MembershipInfoSchema>;

export const CreateOrgSchema = z.object({ name: z.string().min(1).max(120) });
export type CreateOrgInput = z.infer<typeof CreateOrgSchema>;

export const UpdateOrgSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  logo: z.string().url().nullable().or(z.string().startsWith('data:').nullable()).optional(),
  isPublic: z.boolean().optional(),
});
export type UpdateOrgInput = z.infer<typeof UpdateOrgSchema>;

export const CreateInviteSchema = z.object({ role: OrgRoleSchema });
export type CreateInviteInput = z.infer<typeof CreateInviteSchema>;

export const UpdateMemberRoleSchema = z.object({ role: OrgRoleSchema });
export type UpdateMemberRoleInput = z.infer<typeof UpdateMemberRoleSchema>;
```

Add `export * from './org.js';` to `packages/types/src/index.ts`. Run `pnpm --filter @bleachers/types build` → expect success.

- [ ] **Step 2: Create `apps/api/src/orgs/slug.ts`**

```ts
import { randomBytes } from 'node:crypto';

/** kebab(name) truncated to 40 chars + '-' + 6 hex chars. */
export function makeSlug(name: string): string {
  const kebab =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'org';
  return `${kebab}-${randomBytes(3).toString('hex')}`;
}
```

- [ ] **Step 3: Create `apps/api/src/orgs/membership.service.ts`**

```ts
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { OrgRole } from '@bleachers/types';
import { PrismaService } from '../prisma/prisma.service.js';

const ROLE_ORDER: Record<OrgRole, number> = { VIEWER: 0, SCORER: 1, OWNER: 2 };

@Injectable()
export class MembershipService {
  constructor(private readonly prisma: PrismaService) {}

  async roleOf(userId: string, orgId: string): Promise<OrgRole | null> {
    const m = await this.prisma.orgMembership.findUnique({
      where: { orgId_userId: { orgId, userId } },
      select: { role: true },
    });
    return (m?.role as OrgRole) ?? null;
  }

  /** Throws 404 if the org doesn't exist, 403 if the user's role is below `minRole`. */
  async assertMember(userId: string, orgId: string, minRole: OrgRole): Promise<void> {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true },
    });
    if (!org) throw new NotFoundException('Organization not found');
    const role = await this.roleOf(userId, orgId);
    if (!role || ROLE_ORDER[role] < ROLE_ORDER[minRole]) {
      throw new ForbiddenException('You do not have permission in this organization');
    }
  }
}
```

- [ ] **Step 4: Create `apps/api/src/orgs/org.decorators.ts`**

```ts
import { BadRequestException, createParamDecorator, type ExecutionContext } from '@nestjs/common';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The active organization id from the X-Organization-Id header (400 if absent/malformed). */
export const CurrentOrgId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    const id = request.headers['x-organization-id'];
    if (typeof id !== 'string' || !UUID_RE.test(id)) {
      throw new BadRequestException('X-Organization-Id header is required');
    }
    return id;
  },
);
```

- [ ] **Step 5: Create `apps/api/src/orgs/orgs.service.ts`**

```ts
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { CreateOrgInput, OrgRole, UpdateOrgInput } from '@bleachers/types';
import { PrismaService } from '../prisma/prisma.service.js';
import { MembershipService } from './membership.service.js';
import { makeSlug } from './slug.js';

const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

@Injectable()
export class OrgsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly members: MembershipService,
  ) {}

  async create(userId: string, input: CreateOrgInput) {
    return this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: { name: input.name, slug: makeSlug(input.name), createdById: userId },
      });
      await tx.orgMembership.create({ data: { orgId: org.id, userId, role: 'OWNER' } });
      return org;
    });
  }

  async update(userId: string, orgId: string, input: UpdateOrgInput) {
    await this.members.assertMember(userId, orgId, 'OWNER');
    return this.prisma.organization.update({
      where: { id: orgId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.logo !== undefined ? { logo: input.logo } : {}),
        ...(input.isPublic !== undefined ? { isPublic: input.isPublic } : {}),
      },
    });
  }

  async listMembers(userId: string, orgId: string) {
    await this.members.assertMember(userId, orgId, 'VIEWER');
    return this.prisma.orgMembership.findMany({
      where: { orgId },
      include: { user: { select: { id: true, email: true, name: true, image: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async assertNotLastOwner(orgId: string, targetUserId: string): Promise<void> {
    const target = await this.prisma.orgMembership.findUnique({
      where: { orgId_userId: { orgId, userId: targetUserId } },
    });
    if (!target) throw new NotFoundException('Membership not found');
    if (target.role !== 'OWNER') return;
    const owners = await this.prisma.orgMembership.count({ where: { orgId, role: 'OWNER' } });
    if (owners <= 1) throw new BadRequestException('An organization must keep at least one owner');
  }

  async changeRole(userId: string, orgId: string, targetUserId: string, role: OrgRole) {
    await this.members.assertMember(userId, orgId, 'OWNER');
    if (role !== 'OWNER') await this.assertNotLastOwner(orgId, targetUserId);
    return this.prisma.orgMembership.update({
      where: { orgId_userId: { orgId, userId: targetUserId } },
      data: { role },
    });
  }

  async removeMember(userId: string, orgId: string, targetUserId: string) {
    // Owners can remove anyone; anyone can remove themselves (leave).
    if (userId !== targetUserId) await this.members.assertMember(userId, orgId, 'OWNER');
    else await this.members.assertMember(userId, orgId, 'VIEWER');
    await this.assertNotLastOwner(orgId, targetUserId);
    await this.prisma.orgMembership.delete({
      where: { orgId_userId: { orgId, userId: targetUserId } },
    });
    return { removed: true };
  }

  async createInvite(userId: string, orgId: string, role: OrgRole) {
    await this.members.assertMember(userId, orgId, 'OWNER');
    const invite = await this.prisma.orgInvite.create({
      data: {
        orgId,
        role,
        token: randomBytes(18).toString('base64url'),
        createdById: userId,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      },
    });
    return invite;
  }

  async listInvites(userId: string, orgId: string) {
    await this.members.assertMember(userId, orgId, 'OWNER');
    return this.prisma.orgInvite.findMany({
      where: { orgId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revokeInvite(userId: string, orgId: string, inviteId: string) {
    await this.members.assertMember(userId, orgId, 'OWNER');
    await this.prisma.orgInvite.update({
      where: { id: inviteId },
      data: { revokedAt: new Date() },
    });
    return { revoked: true };
  }

  private async validInvite(token: string) {
    const invite = await this.prisma.orgInvite.findUnique({
      where: { token },
      include: { org: { select: { id: true, name: true } } },
    });
    if (!invite || invite.revokedAt || invite.expiresAt < new Date()) return null;
    return invite;
  }

  /** Public preview for the join page. */
  async invitePreview(token: string) {
    const invite = await this.validInvite(token);
    if (!invite) return { valid: false as const };
    return { valid: true as const, orgName: invite.org.name, role: invite.role };
  }

  async acceptInvite(userId: string, token: string) {
    const invite = await this.validInvite(token);
    if (!invite) throw new ForbiddenException('This invite link is no longer valid');
    const existing = await this.prisma.orgMembership.findUnique({
      where: { orgId_userId: { orgId: invite.orgId, userId } },
    });
    if (existing) return { orgId: invite.orgId, role: existing.role, alreadyMember: true };
    const m = await this.prisma.orgMembership.create({
      data: { orgId: invite.orgId, userId, role: invite.role },
    });
    return { orgId: m.orgId, role: m.role, alreadyMember: false };
  }

  /** Public org profile: 404 unless isPublic. */
  async publicProfile(slug: string) {
    const org = await this.prisma.organization.findUnique({ where: { slug } });
    if (!org || !org.isPublic) throw new NotFoundException('Organization not found');
    const teams = await this.prisma.team.findMany({
      where: { organizationId: org.id },
      orderBy: { name: 'asc' },
    });
    const recentMatches = await this.prisma.match.findMany({
      where: { organizationId: org.id, status: { in: ['LIVE', 'COMPLETED'] } },
      orderBy: { scheduledAt: 'desc' },
      take: 20,
      include: { homeTeam: true, awayTeam: true },
    });
    return { org: { name: org.name, slug: org.slug, logo: org.logo }, teams, recentMatches };
  }
}
```

- [ ] **Step 6: Create `apps/api/src/orgs/orgs.controller.ts`**

```ts
import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import {
  CreateInviteSchema,
  CreateOrgSchema,
  UpdateMemberRoleSchema,
  UpdateOrgSchema,
  type CreateInviteInput,
  type CreateOrgInput,
  type UpdateMemberRoleInput,
  type UpdateOrgInput,
} from '@bleachers/types';
import { CurrentUser, Public } from '../auth/auth.decorators.js';
import type { AuthUser } from '../auth/auth.types.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { OrgsService } from './orgs.service.js';

@Controller()
export class OrgsController {
  constructor(private readonly orgs: OrgsService) {}

  @Post('orgs')
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(CreateOrgSchema)) body: CreateOrgInput,
  ) {
    return this.orgs.create(user.id, body);
  }

  @Patch('orgs/:id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateOrgSchema)) body: UpdateOrgInput,
  ) {
    return this.orgs.update(user.id, id, body);
  }

  @Get('orgs/:id/members')
  members(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orgs.listMembers(user.id, id);
  }

  @Patch('orgs/:id/members/:userId')
  changeRole(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
    @Body(new ZodValidationPipe(UpdateMemberRoleSchema)) body: UpdateMemberRoleInput,
  ) {
    return this.orgs.changeRole(user.id, id, targetUserId, body.role);
  }

  @Delete('orgs/:id/members/:userId')
  removeMember(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
  ) {
    return this.orgs.removeMember(user.id, id, targetUserId);
  }

  @Post('orgs/:id/invites')
  createInvite(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(CreateInviteSchema)) body: CreateInviteInput,
  ) {
    return this.orgs.createInvite(user.id, id, body.role);
  }

  @Get('orgs/:id/invites')
  listInvites(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orgs.listInvites(user.id, id);
  }

  @Post('orgs/:id/invites/:inviteId/revoke')
  revokeInvite(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('inviteId', ParseUUIDPipe) inviteId: string,
  ) {
    return this.orgs.revokeInvite(user.id, id, inviteId);
  }

  @Public()
  @Get('invites/:token')
  invitePreview(@Param('token') token: string) {
    return this.orgs.invitePreview(token);
  }

  @Post('invites/:token/accept')
  acceptInvite(@CurrentUser() user: AuthUser, @Param('token') token: string) {
    return this.orgs.acceptInvite(user.id, token);
  }

  @Public()
  @Get('public/orgs/:slug')
  publicProfile(@Param('slug') slug: string) {
    return this.orgs.publicProfile(slug);
  }
}
```

- [ ] **Step 7: Create `apps/api/src/orgs/orgs.module.ts` and wire it**

```ts
import { Global, Module } from '@nestjs/common';
import { OrgsController } from './orgs.controller.js';
import { OrgsService } from './orgs.service.js';
import { MembershipService } from './membership.service.js';

@Global()
@Module({
  controllers: [OrgsController],
  providers: [OrgsService, MembershipService],
  exports: [MembershipService],
})
export class OrgsModule {}
```

Add `OrgsModule` to the `imports` array in `apps/api/src/app.module.ts`.

- [ ] **Step 8: Memberships in `/api/me` — rewrite `apps/api/src/auth/auth.controller.ts`**

```ts
import { Controller, Get } from '@nestjs/common';
import type { MembershipInfo } from '@bleachers/types';
import { CurrentUser } from './auth.decorators.js';
import type { AuthUser } from './auth.types.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Controller()
export class AuthController {
  constructor(private readonly prisma: PrismaService) {}

  /** The authenticated user plus their org memberships (drives the org switcher). */
  @Get('me')
  async me(@CurrentUser() user: AuthUser): Promise<AuthUser & { memberships: MembershipInfo[] }> {
    const rows = await this.prisma.orgMembership.findMany({
      where: { userId: user.id },
      include: { org: { select: { id: true, name: true, slug: true, isPersonal: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return {
      ...user,
      memberships: rows.map((m) => ({
        orgId: m.org.id,
        orgName: m.org.name,
        slug: m.org.slug,
        role: m.role as MembershipInfo['role'],
        isPersonal: m.org.isPersonal,
      })),
    };
  }
}
```

- [ ] **Step 9: Add `getPersonalOrg` to `apps/api/test/helpers/auth.ts`**

Append (reusing the file's existing `admin` client is not needed — use Prisma):

```ts
import { PrismaClient } from '@prisma/client';

const prismaForHelpers = new PrismaClient();

/** The personal org auto-created for a test user by the signup trigger. */
export async function getPersonalOrg(userId: string): Promise<string> {
  const m = await prismaForHelpers.orgMembership.findFirst({
    where: { userId, org: { isPersonal: true } },
    select: { orgId: true },
  });
  if (!m) throw new Error(`No personal org for user ${userId} — signup trigger broken?`);
  return m.orgId;
}
```

- [ ] **Step 10: Write `apps/api/test/orgs.integration.spec.ts` (failing first is impractical here since the module exists by now — still verify the suite fails if you comment out `acceptInvite`'s membership creation once, then restore; record that check in your report)**

```ts
import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { OrgsService } from '../src/orgs/orgs.service';
import { MembershipService } from '../src/orgs/membership.service';
import { createTestUser, deleteTestUser, getPersonalOrg } from './helpers/auth';

describe('Organizations (integration)', () => {
  const prisma = new PrismaService();
  const members = new MembershipService(prisma);
  const orgs = new OrgsService(prisma, members);

  let ownerId = '';
  let joinerId = '';
  let orgId = '';

  beforeAll(async () => {
    await prisma.$connect();
    ownerId = await createTestUser();
    joinerId = await createTestUser();
    const org = await orgs.create(ownerId, { name: 'Test League' });
    orgId = org.id;
  });

  afterAll(async () => {
    if (orgId) await prisma.organization.deleteMany({ where: { id: orgId } });
    await prisma.$disconnect();
    await deleteTestUser(ownerId);
    await deleteTestUser(joinerId);
  });

  it('signup trigger provisioned a personal org for each new user', async () => {
    const personal = await getPersonalOrg(ownerId);
    expect(personal).toBeTruthy();
    const role = await members.roleOf(ownerId, personal);
    expect(role).toBe('OWNER');
  });

  it('non-members are rejected', async () => {
    await expect(members.assertMember(joinerId, orgId, 'VIEWER')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('invite accept creates membership with the invite role, idempotently', async () => {
    const invite = await orgs.createInvite(ownerId, orgId, 'SCORER');
    const first = await orgs.acceptInvite(joinerId, invite.token);
    expect(first).toMatchObject({ orgId, role: 'SCORER', alreadyMember: false });
    const second = await orgs.acceptInvite(joinerId, invite.token);
    expect(second.alreadyMember).toBe(true);
    await expect(members.assertMember(joinerId, orgId, 'SCORER')).resolves.toBeUndefined();
    await expect(members.assertMember(joinerId, orgId, 'OWNER')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('revoked invites stop working', async () => {
    const invite = await orgs.createInvite(ownerId, orgId, 'VIEWER');
    await orgs.revokeInvite(ownerId, orgId, invite.id);
    await expect(orgs.acceptInvite(joinerId, invite.token)).rejects.toThrow(ForbiddenException);
    expect(await orgs.invitePreview(invite.token)).toEqual({ valid: false });
  });

  it('the last owner cannot leave or be demoted', async () => {
    await expect(orgs.changeRole(ownerId, orgId, ownerId, 'SCORER')).rejects.toThrow(
      BadRequestException,
    );
    await expect(orgs.removeMember(ownerId, orgId, ownerId)).rejects.toThrow(BadRequestException);
  });

  it('public profile 404s while private and serves teams when public', async () => {
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    await expect(orgs.publicProfile(org.slug)).rejects.toThrow();
    await orgs.update(ownerId, orgId, { isPublic: true });
    const profile = await orgs.publicProfile(org.slug);
    expect(profile.org.name).toBe('Test League');
    expect(Array.isArray(profile.teams)).toBe(true);
  });
});
```

- [ ] **Step 11: Run the suite + commit**

```bash
pnpm --filter @bleachers/api exec vitest run test/orgs.integration.spec.ts
```

Expected: 6/6 pass against live Supabase. (Whole-workspace typecheck still fails in teams/players/matches/events — expected until Tasks 4–5.) Then:

```bash
git add packages/types apps/api/src/orgs apps/api/src/app.module.ts apps/api/src/auth/auth.controller.ts apps/api/test/orgs.integration.spec.ts apps/api/test/helpers/auth.ts
git commit -m "feat(api): orgs module — memberships, invites, public profile; org types"
```

---

### Task 4: Convert Teams + Players modules to org authorization

**Files:**

- Modify: `apps/api/src/teams/teams.service.ts`, `teams.controller.ts`
- Modify: `apps/api/src/players/players.service.ts`, `players.controller.ts`
- Rewrite: `apps/api/test/ownership.integration.spec.ts` → cross-org isolation for teams/players

**Interfaces:**

- Consumes: `MembershipService`, `@CurrentOrgId()`, `getPersonalOrg` (Task 3).
- Produces signatures (Task 5/7 rely on the pattern): `TeamsService.list(userId, orgId)`, `get(userId, id)`, `create(userId, orgId, input)`, `update(userId, id, input)`, `getRoster(userId, teamId)`, `addToRoster(userId, teamId, input)`, `removeFromRoster(userId, teamId, playerId)`; `PlayersService.list(userId, orgId)`, `get(userId, id)`, `create(userId, orgId, input)`, `update(userId, id, input)`.

- [ ] **Step 1: Rewrite `TeamsService` authorization**

Inject `MembershipService` alongside Prisma. Replace the old `assertOwner` with an org resolver, and apply the pattern to every method:

```ts
  constructor(
    private readonly prisma: PrismaService,
    private readonly members: MembershipService,
  ) {}

  /** Resolve a team's org and assert the caller holds at least `minRole` in it. */
  private async orgOf(teamId: string): Promise<string> {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: { organizationId: true },
    });
    if (!team) throw new NotFoundException('Team not found');
    return team.organizationId;
  }

  async list(userId: string, orgId: string) {
    await this.members.assertMember(userId, orgId, 'VIEWER');
    const teams = await this.prisma.team.findMany({
      where: { organizationId: orgId },
      orderBy: { name: 'asc' },
    });
    return teams.map(toTeam);
  }

  async get(userId: string, id: string) {
    const team = await this.prisma.team.findUnique({ where: { id } });
    if (!team) throw new NotFoundException('Team not found');
    await this.members.assertMember(userId, team.organizationId, 'VIEWER');
    return toTeam(team);
  }

  async create(userId: string, orgId: string, input: CreateTeamInput) {
    await this.members.assertMember(userId, orgId, 'SCORER');
    const team = await this.prisma.team.create({
      data: {
        name: input.name,
        colors: input.colors as unknown as Prisma.InputJsonValue,
        logo: input.logo ?? null,
        sport: input.sport,
        isAdHoc: input.isAdHoc ?? false,
        organizationId: orgId,
        createdById: userId,
      },
    });
    return toTeam(team);
  }

  async update(userId: string, id: string, input: UpdateTeamInput) {
    await this.members.assertMember(userId, await this.orgOf(id), 'SCORER');
    /* existing update body unchanged */
  }

  async getRoster(userId: string, teamId: string) {
    await this.members.assertMember(userId, await this.orgOf(teamId), 'VIEWER');
    /* existing body (minus the old this.get call) */
  }

  async addToRoster(userId: string, teamId: string, input: AddRosterEntryInput) {
    await this.members.assertMember(userId, await this.orgOf(teamId), 'SCORER');
    /* existing upsert body */
  }

  async removeFromRoster(userId: string, teamId: string, playerId: string) {
    await this.members.assertMember(userId, await this.orgOf(teamId), 'SCORER');
    /* existing deleteMany body */
  }
```

Delete the old `assertOwner`.

- [ ] **Step 2: Update `TeamsController`** — every route passes `user.id`; `list` and `create` add `@CurrentOrgId() orgId: string` and pass it; `get`/`roster` now pass `user.id` first (`this.teams.get(user.id, id)` etc.). Import `CurrentOrgId` from `../orgs/org.decorators.js`.

- [ ] **Step 3: Same pattern for `PlayersService`/`PlayersController`** — `list(userId, orgId)` filters `organizationId`, asserts VIEWER; `get(userId, id)` asserts VIEWER on the player's org; `create(userId, orgId, input)` asserts SCORER and stamps `organizationId: orgId`; `update(userId, id, input)` asserts SCORER on the player's org (replacing the createdById check).

- [ ] **Step 4: Rewrite `apps/api/test/ownership.integration.spec.ts` as cross-org isolation**

Keep the two-user setup but derive orgs: `ownerOrg = await getPersonalOrg(ownerId)`, `intruderOrg = await getPersonalOrg(intruderId)`. Services constructed with `new MembershipService(prisma)` injected. Assertions (8 tests):

- intruder `teams.get / players.get / teams.getRoster` on owner's rows → `ForbiddenException` (reads are now org-gated too);
- intruder `teams.update / players.update / addToRoster / removeFromRoster` → `ForbiddenException`;
- owner's same calls succeed;
- `teams.list(ownerId, intruderOrg)` → `ForbiddenException` (can't list someone else's org);
- creates go into the caller's org: `teams.create(ownerId, ownerOrg, …)` row has `organizationId === ownerOrg`.

Write the file first, run `pnpm --filter @bleachers/api exec vitest run test/ownership.integration.spec.ts`, watch it FAIL against the unconverted code (old signatures), then apply Steps 1–3 and re-run → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/teams apps/api/src/players apps/api/test/ownership.integration.spec.ts
git commit -m "feat(api): org-scoped authorization for teams and players"
```

---

### Task 5: Convert Matches + Events + Statistics; API typecheck green

**Files:**

- Modify: `apps/api/src/matches/matches.service.ts`, `matches.controller.ts`
- Modify: `apps/api/src/events/events.service.ts`
- Modify: `apps/api/src/statistics/statistics.service.ts`, `statistics.controller.ts`
- Modify: `apps/api/src/sharing/sharing.service.ts` (call the `*Core` stats variants)
- Modify: `apps/api/test/events.integration.spec.ts`

**Interfaces:**

- Consumes: Task 3 helpers; Task 4 conventions.
- Produces: `MatchesService.list(userId, orgId)`, `get(userId, id)`, `create(userId, orgId, input)`, `update(userId, id, input)`, `setStatus(userId, id, status)`; `EventsService.assertCanScore(userId, matchId)` (same name, membership-backed); `StatisticsService.matchStats(userId, id)`, `playerCareer(userId, id, sport)`, `teamStats(userId, id)` — public sharing paths keep the internal unauthenticated variants (see Step 3).

- [ ] **Step 1: `MatchesService`**

Inject `MembershipService`. `assertOwner` → deleted. New pattern:

- `list(userId, orgId)`: assert VIEWER; `where: { organizationId: orgId }`.
- `get(userId, id)`: fetch, assert VIEWER on `match.organizationId`, return (existing include shape).
- `create(userId, orgId, input)`: assert SCORER; validate both teams exist **and belong to `orgId`** (`homeTeam.organizationId !== orgId` → `BadRequestException('Both teams must belong to the active organization')`); stamp `organizationId: orgId` on the match; **delete the `permissionGrant.create` block** from the transaction.
- `update`/`setStatus`: assert SCORER via the match's org.
- Add a private `orgOf(matchId)` identical in shape to Task 4's.
- Internal helper `getUnchecked(id)` (the old `get` body without membership) — used by `SharingService`-facing stats below? (No — sharing calls `StatisticsService`; see Step 3. Only add `getUnchecked` if `SharingService.publicMatch` currently calls `matches.get`; it queries Prisma directly, so do NOT add it.)

`MatchesController`: `list`/`create` gain `@CurrentOrgId()`; `get` passes `user.id`; `update` passes `user.id` (already does).

- [ ] **Step 2: `EventsService.assertCanScore` becomes membership-backed**

```ts
  async assertCanScore(userId: string, matchId: string): Promise<void> {
    const match = await this.getMatchOrThrow(matchId);
    await this.members.assertMember(userId, match.organizationId, 'SCORER');
  }
```

Inject `MembershipService`; delete the `permissionGrant` lookup. Also gate reads: `list(userId, matchId, includeVoided)` asserts VIEWER on the match's org (controller passes `user.id` — update `EventsController.list` accordingly).

- [ ] **Step 3: `StatisticsService` — authenticated routes gated, public path preserved**

Split each method into a private unauthenticated core + a gated public API:

```ts
  /** Core folds, no auth — used by SharingService for public pages. */
  async matchStatsCore(matchId: string): Promise<MatchStats> { /* existing body */ }

  async matchStats(userId: string, matchId: string): Promise<MatchStats> {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: { organizationId: true },
    });
    if (!match) throw new NotFoundException('Match not found');
    await this.members.assertMember(userId, match.organizationId, 'VIEWER');
    return this.matchStatsCore(matchId);
  }
```

Same split for `playerCareer` (gate on the player's org) and `teamStats` (gate on the team's org). Update `StatisticsController` to pass `@CurrentUser()` `user.id`. Update `SharingService` to call the `*Core` variants (`matchStatsCore`, `playerCareerCore`).

- [ ] **Step 4: Update `apps/api/test/events.integration.spec.ts`**

- Construct services with the new dependencies: `const members = new MembershipService(prisma); const events = new EventsService(prisma, realtime, members); const stats = new StatisticsService(prisma, members); const matches = new MatchesService(prisma, members);` (match constructor orders to the implementations).
- After `userId = await createTestUser();` add `orgId = await getPersonalOrg(userId);`.
- `teams`/`players` created directly via Prisma in this spec: add `organizationId: orgId` to those `create` data blocks.
- `matches.create(userId, …)` → `matches.create(userId, orgId, …)`.
- Stats calls gain `userId` as first arg (`stats.matchStats(userId, matchId)` etc.).
- Remove the `prisma.permissionGrant.deleteMany` cleanup line (table gone).
- Run: `pnpm --filter @bleachers/api test` → expect ALL suites green (jwt 3, orgs 6, cross-org 8, events 6, csv 4).

- [ ] **Step 5: API typecheck must now pass**

```bash
pnpm --filter @bleachers/api typecheck
```

Expected: PASS — no `permissionGrant`/old-signature references remain (`grep -rn "permissionGrant\|PermissionScope" apps/api/src` → zero hits).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src apps/api/test/events.integration.spec.ts
git commit -m "feat(api): org-scoped matches, events, statistics; PermissionGrant fully retired"
```

---

### Task 6: Web org plumbing (store, header, query scoping, switcher)

**Files:**

- Create: `apps/web/src/lib/org-store.ts`
- Modify: `apps/web/src/lib/api.ts` (attach header), `apps/web/src/lib/hooks.ts` (org-scoped keys + `useMe`), `apps/web/src/components/page-header.tsx` (switcher)
- Modify: `apps/web/src/lib/api.test.ts` (header assertions)

**Interfaces:**

- Consumes: `/api/me` memberships (Task 3), `MembershipInfo` type.
- Produces: `useOrgStore` (`{ activeOrgId, memberships, setActiveOrg, setMemberships }`), `useActiveOrgId()`; `api()` sends `X-Organization-Id: <activeOrgId>` whenever set; every list hook keys on `[resource, orgId]`.

- [ ] **Step 1: Create `apps/web/src/lib/org-store.ts`**

```ts
'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { MembershipInfo } from '@bleachers/types';

interface OrgState {
  activeOrgId: string | null;
  memberships: MembershipInfo[];
  setActiveOrg: (orgId: string) => void;
  setMemberships: (memberships: MembershipInfo[]) => void;
}

export const useOrgStore = create<OrgState>()(
  persist(
    (set, get) => ({
      activeOrgId: null,
      memberships: [],
      setActiveOrg: (activeOrgId) => set({ activeOrgId }),
      setMemberships: (memberships) => {
        const current = get().activeOrgId;
        const stillValid = memberships.some((m) => m.orgId === current);
        set({
          memberships,
          activeOrgId: stillValid
            ? current
            : ((memberships.find((m) => m.isPersonal) ?? memberships[0])?.orgId ?? null),
        });
      },
    }),
    { name: 'bleachers-org' },
  ),
);

export const useActiveOrgId = () => useOrgStore((s) => s.activeOrgId);
```

- [ ] **Step 2: Failing test first — extend `apps/web/src/lib/api.test.ts`**

Add (mocking the store like the existing supabase mock — `vi.mock('./org-store', () => ({ useOrgStore: { getState: () => ({ activeOrgId: mockOrgId }) } }))` with a mutable `mockOrgId` via `vi.hoisted`):

```ts
it('attaches the active org id header when set', async () => {
  getSession.mockResolvedValue({ data: { session: { access_token: 't' } } });
  setMockOrgId('11111111-1111-4111-8111-111111111111');
  await apiGet('/api/teams');
  const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
  expect((init.headers as Record<string, string>)['X-Organization-Id']).toBe(
    '11111111-1111-4111-8111-111111111111',
  );
});

it('omits the org header when no active org', async () => {
  getSession.mockResolvedValue({ data: { session: null } });
  setMockOrgId(null);
  await apiGet('/api/me');
  const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
  expect((init.headers as Record<string, string>)['X-Organization-Id']).toBeUndefined();
});
```

Run → FAIL. Then in `api.ts` add after the token lookup:

```ts
const activeOrgId = useOrgStore.getState().activeOrgId;
```

and to the headers object: `...(activeOrgId ? { 'X-Organization-Id': activeOrgId } : {}),` (import `useOrgStore` from `./org-store`). Run → PASS (4 tests total in the file).

- [ ] **Step 3: `useMe` + membership bootstrap + org-scoped keys in `apps/web/src/lib/hooks.ts`**

```ts
export interface Me extends Record<string, unknown> {
  id: string;
  email: string | null;
  memberships: MembershipInfo[];
}

export function useMe() {
  const setMemberships = useOrgStore((s) => s.setMemberships);
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const me = await apiGet<Me>('/api/me');
      setMemberships(me.memberships);
      return me;
    },
  });
}
```

Every org-scoped hook gains the active org in its key and an `enabled` guard; pattern (apply to `usePlayers`, `useTeams`, `useMatches`, and inside `useTeamMemberships`'s per-team queries):

```ts
export const useTeams = () => {
  const orgId = useActiveOrgId();
  return useQuery({
    queryKey: ['teams', orgId],
    queryFn: () => apiGet<Team[]>('/api/teams'),
    enabled: !!orgId,
  });
};
```

Detail hooks (`useMatch`, `useMatchStats`, `useRoster`, `usePlayerCareer`, `useMatchEvents`) keep id-keyed queries (rows are org-resolved server-side) but add the orgId to their keys too (`['match', orgId, id]`) so switching orgs drops caches. Mutations' `invalidateQueries` keys updated to match (`{ queryKey: ['teams', orgId] }` — capture `orgId` inside each mutation hook via `useActiveOrgId()`). The optimistic-update `setQueryData` keys likewise.

- [ ] **Step 4: Org switcher in `apps/web/src/components/page-header.tsx`**

Call `useMe()` (bootstraps memberships) and render the switcher in place of the static `eyebrow` when memberships exist: a button showing the active org's name (falls back to the `eyebrow` prop) that opens the existing glass `Select`-style dropdown listing memberships (name + role sublabel) plus a final `Org settings` row linking to `/org`. Selecting calls `setActiveOrg(orgId)`. Keep the existing sign-out button. (Reuse `Select`'s popover styling by extracting or duplicating its listbox classes — visual consistency with the design system, no new tokens.)

- [ ] **Step 5: Verify + commit**

```bash
pnpm --filter @bleachers/web typecheck && pnpm --filter @bleachers/web exec vitest run
```

Expected: PASS, 4/4 api tests. Then:

```bash
git add apps/web/src/lib apps/web/src/components/page-header.tsx
git commit -m "feat(web): active-org store, org header on api calls, org-scoped query keys, header switcher"
```

---

### Task 7: Web pages — org settings, join, public org; login redirect support

**Files:**

- Create: `apps/web/src/app/org/page.tsx`, `apps/web/src/app/join/[token]/page.tsx`, `apps/web/src/app/o/[slug]/page.tsx`
- Modify: `apps/web/src/app/login/page.tsx` (honor `?next=`), `apps/web/src/components/nav.tsx` (hide nav on `/o/` and `/join/`)

**Interfaces:**

- Consumes: Task 3 endpoints, Task 6 store/hooks.
- Produces: routes `/org`, `/join/<token>`, `/o/<slug>`.

- [ ] **Step 1: Login `next` support** — in `login/page.tsx`, read `const next = useSearchParams().get('next') ?? '/';` (wrap the component usage in a `<Suspense>` boundary per Next.js requirement — export default renders `<Suspense><LoginInner/></Suspense>`), and use `emailRedirectTo: \`${window.location.origin}${next}\``(same for the OAuth`redirectTo`). Existing behavior unchanged when no param.

- [ ] **Step 2: `/join/[token]` page** (client): on load, plain-`fetch` `${API_URL}/api/invites/${token}` (public). States: invalid → glass card "This invite link is no longer valid"; valid + no session (via `useSession()`) → card showing `orgName` + role with a "Sign in to join" button linking `/login?next=/join/${token}`; valid + session → "Join {orgName} as {role}" button calling `apiPost('/api/invites/'+token+'/accept')`, then `setActiveOrg(orgId)`, invalidate `['me']`, `router.replace('/')`. Reuse `Card`/`Button`/`Skeleton`/`QueryError`-style patterns from the design system.

- [ ] **Step 3: `/o/[slug]` public page** (server component, mirrors `/m/[id]`): fetch `${API_URL}/api/public/orgs/${slug}` with `cache: 'no-store'` via `API_URL` from `@/lib/api-url`; `notFound()` on non-OK. Render: org name (+ logo `Avatar` fallback), team list (color bar + name), recent matches list (team names, status badge, link to `/m/<id>` — score shown is not required v1; link suffices since scores derive on the match page). Floodlight glass styling per existing public page.

- [ ] **Step 4: `/org` settings page** (client, wrapped in `AuthGate`): reads `useMe()` + active org; role gates from the membership row.
- All members see: org name, their role, member list (name/email + role).
- OWNER additionally: rename form (`apiPatch('/api/orgs/'+id)`), public toggle (shows `/o/<slug>` URL when on, copy button), member role `Select` + remove buttons, invite section — role picker + "Create invite link" → list of active invites with full `${window.location.origin}/join/${token}` copy buttons and revoke.
- Mutations invalidate `['me']` and an `['org-members', orgId]` / `['org-invites', orgId]` pair of queries defined locally in this page's module with `useQuery`.
- Empty/error/loading states per the design system (Skeleton + explicit error text; full `QueryErrorState` arrives in Spec 2).

- [ ] **Step 5: `nav.tsx`** — extend the early-return to also hide on `pathname.startsWith('/o/')` and `pathname.startsWith('/join/')`.

- [ ] **Step 6: Verify + commit**

```bash
pnpm --filter @bleachers/web typecheck && pnpm --filter @bleachers/web exec vitest run && pnpm --filter @bleachers/web build
```

Expected: all PASS (build catches server/client boundary mistakes on the new pages). Then:

```bash
git add apps/web/src/app apps/web/src/components/nav.tsx
git commit -m "feat(web): org settings, join-link flow, public org page, login next-redirect"
```

---

### Task 8: Full gate, docs, final review, single-push rollout

**Files:**

- Modify: `README.md` (orgs paragraph), memory file (controller does this), `.superpowers/sdd/progress.md`

**Interfaces:** none — verification and shipping.

- [ ] **Step 1: Full workspace gate**

```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Expected: every step green (api suites run live: jwt 3 + orgs 6 + cross-org 8 + events 6 + csv 4 = 27).

- [ ] **Step 2: E2E suite**

```bash
pnpm test:e2e
```

Requires local API running (`pnpm --filter @bleachers/api dev` + seeded DB — already seeded). Expected: existing 3 specs pass (public match, auth redirect, sent state). The join-flow happy path is covered at integration level (Task 3) per the spec deviation note.

- [ ] **Step 3: README** — add a short "Organizations" paragraph under the architecture section: data belongs to orgs; roles OWNER/SCORER/VIEWER; personal org auto-created at signup; invite links at `/join/<token>`; opt-in public org pages at `/o/<slug>`.

- [ ] **Step 4: Final whole-branch review** — generate the branch review package (`git log/diff main..HEAD` to a file) and dispatch the code-reviewer on the most capable model per the subagent-driven workflow. Fix Critical/Important findings; re-review.

- [ ] **Step 5: Merge + single push (the rollout moment)**

```bash
git checkout main && git merge --ff-only feat/organizations && git push origin main
```

CI applies the migration (already applied to the shared DB in Task 2 — `migrate deploy` no-ops), Railway deploys the org-aware API, Vercel deploys the org-aware web. Watch both deploys; then probe production: `/health` 200; `GET /api/teams` without header → 400; public org page 404s for the (private) personal org slug; sign in on prod → seeded data visible under the personal org.

- [ ] **Step 6: Ledger + branch cleanup** — record completion in `.superpowers/sdd/progress.md`; delete `feat/organizations`.

---

## Done criteria

- All domain rows org-stamped; `permission_grant` table and `PermissionScope` gone from DB and code.
- Signing up (live test user) yields profile + personal org + OWNER membership via trigger.
- Cross-org isolation proven by integration tests at read and write level for every module.
- Invite link lifecycle (create → preview → accept → idempotent re-accept → revoke → last-owner guards) proven by integration tests.
- Web: org switcher works; all queries org-scoped; `/org`, `/join/<token>`, `/o/<slug>` live; production verified post-deploy.
