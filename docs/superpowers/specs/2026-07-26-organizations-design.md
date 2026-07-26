# Organizations — Multi-User Tenancy

**Status:** Approved design · 2026-07-26
**Scope:** Move Bleachers from per-user data ownership to organization-based tenancy: teams, players, matches, and competitions belong to an organization; users are members of organizations with roles. Includes membership, invite links, an opt-in public org profile, and migration of existing data.
**Sequencing:** Spec 1 of 2. The onboarding/images iteration (`2026-07-26-onboarding-team-ux-images-design.md`) builds on this and is executed after it.

## Context

Today every domain row carries `createdById` and all list endpoints filter by it — each account lives in a private world. The product owner wants shared worlds: a Sunday league's scorekeepers should work off the same teams, players should accumulate one career, and a co-scorer should be invitable. Public-by-default was rejected on privacy grounds (grassroots players are often minors; face photos are coming in Spec 2).

Production state at time of writing: one real user (`olayinkacodes@gmail.com`, auth id `a24fc576…`) owning 2 teams / 10 players / 1 match, plus orphaned `test-*`/`probe-*` users from CI-era flakiness. Migration cost is minimal now and grows with every new user.

## Decisions (locked)

1. **Organizations** own all domain data; users hold **role-carrying memberships** (existing `Role` enum: `OWNER` / `SCORER` / `VIEWER`).
2. **Personal org auto-created at signup** (extending the existing `handle_new_user` trigger) so solo users feel no friction.
3. **Invite links** (shareable token URLs, role baked in, multi-use, revocable, 14-day expiry). No email invites in v1.
4. **Opt-in public org profiles** at `/o/<slug>`: org name/logo, teams, recent results. Player careers and photos stay link-gated regardless.
5. **`PermissionGrant` and `PermissionScope` are retired** — org roles replace them (the table was written but never meaningfully read).
6. Navigation: **no org tab**. Org switcher + settings live in the header; "Leagues" as a nav concept is reserved for Phase-3 competitions.
7. `createdById` columns remain on all domain rows purely as audit trail; authorization decisions use membership only.

## Data model

### New models

```prisma
model Organization {
  id        String   @id @default(uuid()) @db.Uuid
  name      String
  /** URL identity for the public page; auto-generated, unique. */
  slug      String   @unique
  logo      String?
  isPublic  Boolean  @default(false)
  /** True for the org auto-created at signup; used only for UX defaults. */
  isPersonal Boolean @default(false)
  createdById String @db.Uuid
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  memberships OrgMembership[]
  invites     OrgInvite[]
  teams       Team[]
  players     Player[]
  matches     Match[]
  competitions Competition[]

  @@map("organization")
}

model OrgMembership {
  id        String   @id @default(uuid()) @db.Uuid
  orgId     String   @db.Uuid
  org       Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  userId    String   @db.Uuid
  user      Profile  @relation(fields: [userId], references: [id], onDelete: Cascade)
  role      Role
  createdAt DateTime @default(now())

  @@unique([orgId, userId])
  @@index([userId])
  @@map("org_membership")
}

model OrgInvite {
  id        String    @id @default(uuid()) @db.Uuid
  orgId     String    @db.Uuid
  org       Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  /** Random URL-safe token (crypto, ≥24 chars); the invite URL is /join/<token>. */
  token     String    @unique
  role      Role
  createdById String  @db.Uuid
  expiresAt DateTime
  revokedAt DateTime?
  createdAt DateTime  @default(now())

  @@map("org_invite")
}
```

### Changed models

- `Team`, `Player`, `Match`, `Competition`: add required `organizationId String @db.Uuid` + relation + `@@index([organizationId])`. `createdById` stays.
- `Profile`: add `memberships OrgMembership[]` back-relation.
- **Delete** `PermissionGrant` model and `PermissionScope` enum.

### Slug generation

`kebab(name)` truncated to 40 chars + `-` + 6 hex chars of randomness; regenerate on collision. Not user-editable in v1.

### Signup trigger (replaces current `handle_new_user`)

On `auth.users` insert: create profile (as today), then an `organization` (name `<display name or email local-part>'s Club`, `isPersonal = true`, `createdById = user id`) and an `org_membership` (OWNER). Same `security definer, set search_path = ''` discipline, execute revoked from public/anon/authenticated. Ships as a raw-SQL migration replacing the trigger function.

## Migration of existing data

Single raw-SQL migration, run after the schema migration adds nullable `organizationId` columns and before a follow-up migration marks them `NOT NULL`:

1. Orphaned test/probe users are swept **before** this migration by an admin-API cleanup script (deleting the auth users cascades their profiles). The migration is additionally defensive: it skips creating orgs for any profile whose email matches `%@bleachers.test`.
2. For each remaining profile without a membership: insert a personal org + OWNER membership (same naming rule as the trigger).
3. Backfill `organizationId` on `team`/`player`/`match`/`competition` from each row's `createdById` → that user's personal org.
4. Drop `permission_grant` table and `PermissionScope` enum type.

**Rollout note:** the dev and production API share one database, and CI applies migrations on push. Old API code writes rows without `organizationId` and would violate the eventual NOT NULL. Acceptable for the current single-user reality: land schema + code in one push so the Railway deploy follows the migration within minutes; do not stagger this work across days on `main`.

## Authorization model

One helper replaces `assertOwner`/`assertCanScore`:

```
assertMember(userId, orgId, minRole)   // role order: VIEWER < SCORER < OWNER
```

- **VIEWER:** read everything in the org.
- **SCORER:** VIEWER + create/update teams, players, matches; record/void/undo events; batch sync.
- **OWNER:** SCORER + org settings (name, logo, isPublic), memberships (change role, remove member), invites (create, revoke). At least one OWNER must remain (blocking role-change/removal that would orphan the org).

**Org resolution:**

- Detail/mutation routes (`/api/teams/:id`, `/api/matches/:id/events`, …) resolve `orgId` from the row itself, then `assertMember`. No header needed.
- Collection routes (`GET/POST /api/teams`, `/api/players`, `/api/matches`) require the active org from the **`X-Organization-Id`** request header; requests without it (or without membership) are rejected 400/403. A small `@CurrentOrg()` decorator + guard provides this.
- `GET /api/me` response gains `memberships: [{ orgId, orgName, slug, role, isPersonal }]` so the client can populate the switcher without an extra round trip.

Public endpoints stay `@Public()` and gain the org profile route (below). Event recording keeps its idempotency semantics; `recordedById` audit unchanged.

## API surface (delta)

```
GET    /api/me                          + memberships in payload
POST   /api/orgs                        Create org (any user; becomes OWNER)
PATCH  /api/orgs/:id                    OWNER: name, logo, isPublic
GET    /api/orgs/:id/members            Member list (any member)
PATCH  /api/orgs/:id/members/:userId    OWNER: change role (guard last-OWNER)
DELETE /api/orgs/:id/members/:userId    OWNER: remove member (guard last-OWNER); users may remove themselves (leave)
POST   /api/orgs/:id/invites            OWNER: { role } → { token, url, expiresAt }
GET    /api/orgs/:id/invites            OWNER: list active invites
POST   /api/orgs/:id/invites/:inviteId/revoke   OWNER
GET    /api/invites/:token              @Public: { orgName, role, valid } (for the join page preview)
POST   /api/invites/:token/accept       Auth: creates membership (idempotent if already a member)
GET    /api/public/orgs/:slug           @Public: 404 unless isPublic; { org, teams, recentMatches }
```

All existing team/player/match/event/stats routes keep their paths; their authorization switches to `assertMember` and collection routes become org-scoped via the header.

## Web app

- **Active org state:** zustand store persisted to `localStorage` (`activeOrgId`), initialised from `/api/me` memberships (prefer `isPersonal` if nothing stored). `api()` attaches `X-Organization-Id` automatically; every React Query key gains the active org id prefix so switching orgs never shows stale cross-org data.
- **Header:** org switcher (name + chevron; single-membership users see just the name), linking to org settings (OWNER) and "Join with a link" hint.
- **Org settings page** (`/org`): rename, logo (placeholder until Spec 2 upload lands — URL field hidden, defer), public toggle with the slug URL shown when enabled, member list with role management, invite-link creation (role picker → copyable URL) and revocation.
- **Join page** (`/join/[token]`): shows org name + role (from the public preview endpoint); unauthenticated users go through login and return via `redirectTo`; accept → set active org → dashboard.
- **Public org page** (`/o/[slug]`): server component like the public match page; org name/logo, team list, recent matches (live + completed with scores) linking to public match pages.
- Offline queue and live scoring are untouched (event writes resolve org from the match server-side).

## Seed

`apps/api/prisma/seed.ts` is updated: after `ensureSeedUser()`, resolve (or create) that user's personal org and stamp `organizationId` on every seeded team/player/match. Idempotent as today.

## Testing

- **Integration (live DB, via the existing helpers):** cross-org isolation — a member of org A gets 403 on org B's team/match reads and writes at every changed route class (collection + detail + events); role ladder — VIEWER blocked from writes, SCORER blocked from org settings/invites; invite accept creates membership and is idempotent; last-OWNER guard; signup trigger creates personal org + membership (assert via `createTestUser`).
- **Unit:** slug generation, role-ordering helper.
- **E2E:** join-link flow happy path against the seeded org (create invite via API, accept as a second test user, see the seeded teams).
- Existing integration tests updated to org-scoped setup (create org via signup trigger's personal org).
- Full gate (format, lint, typecheck, unit + integration, build) green before merge.

## Out of scope

- Email invites, org deletion, org transfer, per-team visibility overrides, cross-org player identity (a player exists within one org), Phase-3 competitions UI, image uploads (Spec 2).
