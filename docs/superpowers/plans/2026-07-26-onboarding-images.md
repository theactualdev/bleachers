# Onboarding, Team-Born Players & Images — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Team-centric registration (players created only through teams), a match wizard that never dead-ends, crop-based image uploads for team logos and player photos, and explicit error states on every data screen.

**Architecture:** New `POST /api/teams/register` (team+players+roster in one transaction) and `POST /api/teams/:id/players` (create+roster atomically); `POST /api/players` removed. New `POST /api/media/upload` streams a cropped image to a public Supabase Storage bucket via the service-role client. Web gains `ImagePicker` (react-easy-crop → 512² WebP), `Avatar` (logo/photo with color-bar/initials fallback), `QueryErrorState`, a reusable `TeamRegistrationForm` used at `/teams/new` AND embedded in the match wizard's step 0, and a read-only Players tab. Spec: `docs/superpowers/specs/2026-07-26-onboarding-team-ux-images-design.md`. Everything is org-scoped per the shipped Organizations feature.

**Tech Stack:** NestJS (+ multer via `FileInterceptor`), Supabase Storage, Prisma, Next.js App Router, React Query, `react-easy-crop`, Vitest, Playwright.

## Global Constraints

- Branch **`feat/onboarding-images`** off `main`; commit per task with trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` (`git -c user.name="theactualdev" -c user.email="olayinkacodes@gmail.com" commit ...`). **No push until the final task** (API route removal must deploy together with the web that stops calling it).
- zod v3; `.js` import extensions in `apps/api`, extensionless in `apps/web`; pinned deps (`pnpm add -E`); prettier+LF; tokens-only styling (Floodlight glass system); never print `.env` secrets.
- Org rules: new API routes take `@CurrentOrgId()` where collection-scoped, assert membership via `MembershipService` (`VIEWER` read / `SCORER` write); web calls inherit the `X-Organization-Id` header automatically from `api()`.
- Integration tests run live (existing helpers in `apps/api/test/helpers/auth.ts`; admin API ~10% flaky per call — helpers retry).
- Read every file before editing it; in-repo exemplars are binding style guides: `apps/api/src/orgs/*` (module shape), `apps/api/test/ownership.integration.spec.ts` (test shape), `apps/web/src/components/ui/select.tsx` (glass popover), `apps/web/src/app/o/[slug]/page.tsx` (server component).

---

### Task 1: API media upload (Supabase Storage)

**Files:**

- Create: `apps/api/src/media/media.module.ts`, `media.controller.ts`, `media.service.ts`
- Modify: `apps/api/src/app.module.ts` (import MediaModule), `apps/api/package.json` (deps)
- Create: `apps/api/test/media.integration.spec.ts`

**Interfaces:**

- Produces: `POST /api/media/upload` (multipart field `file`, SCORER+ in active org) → `{ url: string }`. Bucket `media`, key `<orgId>/<uuid>.<ext>`.

- [ ] **Step 1: Branch + deps**

```bash
git checkout main && git pull && git checkout -b feat/onboarding-images
pnpm --filter @bleachers/api add -E -D @types/multer
```

(`multer` itself ships inside `@nestjs/platform-express`; only types are needed.)

- [ ] **Step 2: `media.service.ts`**

```ts
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';

const BUCKET = 'media';
const ALLOWED: Record<string, string> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

@Injectable()
export class MediaService {
  private readonly logger = new Logger('Media');
  private readonly storage: SupabaseClient;
  private bucketReady = false;

  constructor() {
    this.storage = createClient(env.supabase.url, env.supabase.serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  /** Idempotently ensure the public bucket exists (first upload wins the race). */
  private async ensureBucket(): Promise<void> {
    if (this.bucketReady) return;
    const { error } = await this.storage.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: MAX_UPLOAD_BYTES,
    });
    if (error && !/already exists/i.test(error.message)) throw error;
    this.bucketReady = true;
  }

  async upload(orgId: string, file: { mimetype: string; size: number; buffer: Buffer }) {
    const ext = ALLOWED[file.mimetype];
    if (!ext) throw new BadRequestException('Only WebP, JPEG, or PNG images are allowed');
    if (file.size > MAX_UPLOAD_BYTES)
      throw new BadRequestException('Image must be 2 MB or smaller');

    await this.ensureBucket();
    const key = `${orgId}/${randomUUID()}.${ext}`;
    const { error } = await this.storage.storage
      .from(BUCKET)
      .upload(key, file.buffer, { contentType: file.mimetype, upsert: false });
    if (error) {
      this.logger.error(`upload failed: ${error.message}`);
      throw new BadRequestException('Upload failed — try again');
    }
    const { data } = this.storage.storage.from(BUCKET).getPublicUrl(key);
    return { url: data.publicUrl };
  }

  /** Test helper surface: delete an object by its public URL path. */
  async removeByUrl(url: string): Promise<void> {
    const marker = `/object/public/${BUCKET}/`;
    const idx = url.indexOf(marker);
    if (idx === -1) return;
    await this.storage.storage.from(BUCKET).remove([url.slice(idx + marker.length)]);
  }
}
```

- [ ] **Step 3: `media.controller.ts`**

```ts
import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../auth/auth.decorators.js';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentOrgId } from '../orgs/org.decorators.js';
import { MembershipService } from '../orgs/membership.service.js';
import { MediaService, MAX_UPLOAD_BYTES } from './media.service.js';

@Controller('media')
export class MediaController {
  constructor(
    private readonly media: MediaService,
    private readonly members: MembershipService,
  ) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  async upload(
    @CurrentUser() user: AuthUser,
    @CurrentOrgId() orgId: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('A "file" upload field is required');
    await this.members.assertMember(user.id, orgId, 'SCORER');
    return this.media.upload(orgId, file);
  }
}
```

`media.module.ts`: standard module (controller + MediaService provider, export MediaService); add to `app.module.ts` imports.

- [ ] **Step 4: Failing test first — `apps/api/test/media.integration.spec.ts`**

Service-level (matches the repo's test pattern): construct `new MediaService()`; use `createTestUser`/`getPersonalOrg` for an orgId. Tests: (a) rejects `mimetype: 'text/plain'` with BadRequest; (b) rejects `size > 2MB` (buffer can be small; the service checks the `size` field) with BadRequest; (c) happy path — 1×1 PNG buffer (`Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')`, mimetype `image/png`, its real byteLength as size) → returned `url` contains `/media/${orgId}/` and `fetch(url)` returns 200 with `content-type: image/png`; afterwards `removeByUrl(url)` and assert a re-fetch returns non-200. Run → fails (module missing) → implement Steps 2–3 → green.

- [ ] **Step 5: Gates + commit**

`pnpm --filter @bleachers/api typecheck` PASS; media suite green; `git add apps/api ... && git commit -m "feat(api): org-scoped media upload to Supabase Storage"`.

---

### Task 2: Types + composite team registration + team-born players (API)

**Files:**

- Create: `packages/types/src/registration.ts`; Modify: `packages/types/src/index.ts`
- Modify: `apps/api/src/teams/teams.service.ts`, `teams.controller.ts`
- Modify: `apps/api/src/players/players.service.ts`, `players.controller.ts` (remove `create`)
- Create: `apps/api/test/registration.integration.spec.ts`

**Interfaces:**

- Produces: `POST /api/teams/register` → `{ team: Team; roster: RosterEntryWithPlayer[] }`; `POST /api/teams/:id/players` → `RosterEntryWithPlayer`; **`POST /api/players` removed**; types `RegisterTeamInput`, `CreateTeamPlayerInput` from `@bleachers/types`.

- [ ] **Step 1: `packages/types/src/registration.ts`**

```ts
import { z } from 'zod';
import { JerseyNumberSchema, TeamColorsSchema } from './common.js';

const PhotoSchema = z.string().url().nullable().or(z.string().startsWith('data:').nullable());

export const RegisterTeamPlayerSchema = z.object({
  name: z.string().min(1).max(120),
  jerseyNumber: JerseyNumberSchema.optional(),
  photo: PhotoSchema.optional(),
});

export const RegisterTeamSchema = z.object({
  name: z.string().min(1).max(120),
  colors: TeamColorsSchema,
  logo: PhotoSchema.optional(),
  players: z.array(RegisterTeamPlayerSchema).max(40).default([]),
});
export type RegisterTeamInput = z.infer<typeof RegisterTeamSchema>;

export const CreateTeamPlayerSchema = RegisterTeamPlayerSchema;
export type CreateTeamPlayerInput = z.infer<typeof CreateTeamPlayerSchema>;
```

Export from index; `pnpm --filter @bleachers/types build`. (Check `JerseyNumberSchema` lives in `common.ts` — it does, used by `team.ts`.)

- [ ] **Step 2: Failing tests first — `registration.integration.spec.ts`**

Pattern-match `ownership.integration.spec.ts` (two users not needed; one user + personal org). Tests:

1. `teams.register(userId, orgId, { name, colors, players: [2 rows] })` → team stamped with org, roster length 2, players org-stamped, jersey preserved;
2. registration with `players: []` works;
3. `teams.addPlayer(userId, teamId, { name })` → creates player + roster entry atomically (assert both rows);
4. atomicity: `register` with a player row whose name is `''`... (schema-invalid rows are rejected pre-service by the pipe; for service-level atomicity use a DB-level failure: pass 41 players? schema caps at 40 pre-service too. Instead prove transactionality by mocking? Keep it honest: assert atomicity via `addPlayer` on a NONEXISTENT team id → NotFound AND no orphan player row with that name afterwards);
5. cross-org: second user's `register` into first user's org → Forbidden.
   Run → fail (methods missing) → implement → green.

- [ ] **Step 3: Implement `TeamsService.register` + `TeamsService.addPlayer`**

```ts
  async register(userId: string, orgId: string, input: RegisterTeamInput) {
    await this.members.assertMember(userId, orgId, 'SCORER');
    const result = await this.prisma.$transaction(async (tx) => {
      const team = await tx.team.create({
        data: {
          name: input.name,
          colors: input.colors as unknown as Prisma.InputJsonValue,
          logo: input.logo ?? null,
          sport: 'FOOTBALL',
          organizationId: orgId,
          createdById: userId,
        },
      });
      const roster = [];
      for (const p of input.players) {
        const player = await tx.player.create({
          data: {
            name: p.name,
            photo: p.photo ?? null,
            dateOfBirth: null,
            organizationId: orgId,
            createdById: userId,
          },
        });
        const entry = await tx.rosterEntry.create({
          data: { teamId: team.id, playerId: player.id, jerseyNumber: p.jerseyNumber ?? null },
          include: { player: true },
        });
        roster.push(entry);
      }
      return { team, roster };
    });
    return {
      team: toTeam(result.team),
      roster: result.roster.map((e) => ({ ...toRosterEntry(e), player: toPlayer(e.player) })),
    };
  }

  async addPlayer(userId: string, teamId: string, input: CreateTeamPlayerInput) {
    const orgId = await this.orgOf(teamId);
    await this.members.assertMember(userId, orgId, 'SCORER');
    const entry = await this.prisma.$transaction(async (tx) => {
      const player = await tx.player.create({
        data: {
          name: input.name,
          photo: input.photo ?? null,
          dateOfBirth: null,
          organizationId: orgId,
          createdById: userId,
        },
      });
      return tx.rosterEntry.create({
        data: { teamId, playerId: player.id, jerseyNumber: input.jerseyNumber ?? null },
        include: { player: true },
      });
    });
    return { ...toRosterEntry(entry), player: toPlayer(entry.player) };
  }
```

(`sport: 'FOOTBALL'` is correct for now — the app is football-only and the existing create paths hardcode it likewise on the web side; note it for Phase 2.) Controller: `@Post('register')` with `@CurrentOrgId()` + `RegisterTeamSchema` pipe; `@Post(':id/players')` with `CreateTeamPlayerSchema` pipe. **Route order:** declare `register` BEFORE the `@Get(':id')`-style param routes in the controller class to avoid `register` matching as `:id`.

- [ ] **Step 4: Remove standalone player creation** — delete `PlayersService.create` and the controller's `@Post()` route (keep `list`/`get`/`update`). Grep `apps/api/src` for `players.create` → zero hits.

- [ ] **Step 5: Gates + commit** — registration suite green; full API suite still green (`pnpm --filter @bleachers/api test`); typecheck PASS. Commit `feat(api): composite team registration; players are team-born; drop POST /api/players`.

---

### Task 3: Web `ImagePicker` + `Avatar` + upload hook

**Files:**

- Create: `apps/web/src/components/ui/image-picker.tsx`, `apps/web/src/components/ui/avatar.tsx`, `apps/web/src/lib/image.ts`
- Modify: `apps/web/package.json` (dep), `apps/web/src/lib/hooks.ts` (`useUploadImage`)
- Create: `apps/web/src/lib/image.test.ts`

**Interfaces:**

- Produces: `<ImagePicker value onChange label shape>` (uploads via `/api/media/upload`, returns URL through `onChange`); `<Avatar src name color size shape>` fallback = initials (players) or color bar (teams via `color`); `exportCroppedImage(image, cropPixels): Promise<Blob>` in `lib/image.ts` (512×512, WebP quality 0.85, JPEG fallback).

- [ ] **Step 1:** `pnpm --filter @bleachers/web add -E react-easy-crop`

- [ ] **Step 2: `lib/image.ts` (pure, testable)**

```ts
export interface CropPixels {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const AVATAR_SIZE = 512;

/** Draw the cropped region to a 512² canvas; WebP 0.85 with JPEG fallback. */
export async function exportCroppedImage(
  image: CanvasImageSource,
  crop: CropPixels,
  createCanvas: (w: number, h: number) => HTMLCanvasElement = (w, h) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  },
): Promise<Blob> {
  const canvas = createCanvas(AVATAR_SIZE, AVATAR_SIZE);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D unavailable');
  ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
  const toBlob = (type: string, quality?: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  const webp = await toBlob('image/webp', 0.85);
  if (webp && webp.type === 'image/webp') return webp;
  const jpeg = await toBlob('image/jpeg', 0.85);
  if (!jpeg) throw new Error('Image export failed');
  return jpeg;
}
```

Unit test (`image.test.ts`, failing first): stub canvas via the injectable `createCanvas` (fake canvas object with `getContext` returning a recording ctx and `toBlob` yielding a `Blob(['x'], {type:'image/webp'})`): asserts (a) canvas created at 512×512, (b) `drawImage` called with the crop rect and full destination, (c) WebP blob returned; (d) when the fake `toBlob` yields a PNG-typed blob for webp (unsupported-encoder simulation) then a JPEG on second call, the JPEG is returned.

- [ ] **Step 3: `useUploadImage` in hooks.ts** — mutation that builds `FormData` (`file` field from a Blob), calls `fetch(${API_URL}/api/media/upload, { method:'POST', body, headers: Authorization + X-Organization-Id — NOT Content-Type })`. It cannot reuse `api()` (JSON header); implement inline with `supabase.auth.getSession()` + `useOrgStore.getState()` mirroring `api.ts`, returning `{ url }`.

- [ ] **Step 4: `Avatar` + `ImagePicker` components** — `Avatar`: img with `object-cover rounded` when `src`, else initials on glass (players) or the color bar (teams pass `color`); sizes sm/md/lg via tokens. `ImagePicker`: hidden `<input type="file" accept="image/*">`, on pick → object URL into a glass modal with `react-easy-crop` (`aspect={1}`, `cropShape={shape}`), zoom slider, Cancel / Use photo buttons → `exportCroppedImage` → `useUploadImage` → `onChange(url)`; busy state on the confirm button; upload errors shown inline in the dialog (never silent); removable when `value` set. Follow the glass sheet styling of `event-picker.tsx`.

- [ ] **Step 5: Gates + commit** — web typecheck, vitest (api.test 4 + image tests) green, build green. Commit `feat(web): image crop/upload pipeline and avatar component`.

---

### Task 4: `QueryErrorState` + loading/error/empty rollout

**Files:**

- Create: `apps/web/src/components/ui/query-error.tsx`
- Modify: dashboard `app/page.tsx`, `app/teams/page.tsx`, `app/players/page.tsx`, `app/teams/[id]/page.tsx`, `app/players/[id]/page.tsx`, `app/matches/[id]/page.tsx`, `app/matches/[id]/live/page.tsx`

**Interfaces:**

- Produces: `<QueryErrorState what error onRetry>` glass card (message + reason via `ApiError.message` when available + amber Retry button).

- [ ] **Step 1: Component**

```tsx
'use client';

import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Failed-load state: never render blankness when a query errors. */
export function QueryErrorState({
  what,
  error,
  onRetry,
}: {
  what: string;
  error?: unknown;
  onRetry: () => void;
}) {
  const reason = error instanceof Error && error.message ? error.message : null;
  return (
    <div className="glass rim relative overflow-hidden rounded-xl px-6 py-10 text-center">
      <p className="font-display text-ink-1 text-2xl font-bold tracking-tight">
        Couldn&apos;t load {what}
      </p>
      {reason && <p className="text-ink-3 mx-auto mt-1 max-w-xs text-sm">{reason}</p>}
      <Button variant="glass" className="mt-5" onClick={onRetry}>
        <RotateCcw className="h-4 w-4" /> Retry
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Rollout** — for each listed screen, destructure `isError, error, refetch` from the primary query and insert the error branch between loading and empty (`isLoading ? skeleton : isError ? <QueryErrorState what="…" error={error} onRetry={() => refetch()} /> : empty ? … : data`). Live scoring: the initial `useMatch` failure renders `QueryErrorState what="the match"` full-screen instead of the eternal spinner. Match detail: same. Team/player detail pages: guard their primary queries.

- [ ] **Step 3: Gates + commit** — typecheck/vitest/build green. Commit `feat(web): explicit error states with retry on all data screens`.

---

### Task 5: `TeamRegistrationForm` + `/teams/new`

**Files:**

- Create: `apps/web/src/components/team-registration-form.tsx`, `apps/web/src/app/teams/new/page.tsx`
- Modify: `apps/web/src/lib/hooks.ts` (`useRegisterTeam`), `apps/web/src/app/teams/page.tsx` (swap inline form for a "New team" button)

**Interfaces:**

- Produces: `<TeamRegistrationForm compact? onDone(team)>` two-step (Identity: name/color/logo via ImagePicker; Squad: repeatable rows name/jersey/photo, skippable) calling `useRegisterTeam`; `useRegisterTeam()` mutation → `apiPost('/api/teams/register', input)` invalidating `['teams', orgId]` (+ rosters).

- [ ] **Step 1:** `useRegisterTeam` in hooks.ts (org-scoped invalidation, same shape as `useCreateTeam` minus optimism — server round-trip is one call; keep it simple, no optimistic update).
- [ ] **Step 2:** Build the form component: step state (identity → squad), COLORS palette moved here from `teams/page.tsx` (export it from the form module), player rows managed as an array with add/remove, `ImagePicker shape="round"` for player photos and `shape="rect"` for the logo; `compact` variant tightens paddings and hides the big step header (wizard embed). Submit → mutation → `onDone(team)`.
- [ ] **Step 3:** `/teams/new` page: `AuthGate` + `PageHeader title="New team"` + the form; `onDone` → `router.push('/teams/' + team.id)`. Teams page: remove the inline form + `useCreateTeam` usage (hook itself may remain for API completeness — remove it from hooks.ts ONLY if nothing else imports it; check `matches/new` first) and add a `New team` primary button linking `/teams/new`.
- [ ] **Step 4:** Gates (typecheck/vitest/build) + commit `feat(web): two-step team registration with logo and squad`.

---

### Task 6: Wizard never dead-ends + read-only Players + team-page "New player"

**Files:**

- Modify: `apps/web/src/app/matches/new/page.tsx`, `apps/web/src/app/players/page.tsx`, `apps/web/src/app/teams/[id]/page.tsx`, `apps/web/src/lib/hooks.ts`

**Interfaces:**

- Produces: `useCreateTeamPlayer(teamId)` → `apiPost('/api/teams/'+teamId+'/players', input)` invalidating `['roster', orgId, teamId]` + `['players', orgId]`.

- [ ] **Step 1: Wizard step 0** — read the file; with `useTeams` now exposing `isLoading/isError`: loading → skeletons; error → `QueryErrorState what="your teams" onRetry={refetch}` (NEVER the create path); success with `<2` teams → embedded `<TeamRegistrationForm compact onDone={() => refetch()}>` under a "Create your first/second team" eyebrow; success with `≥2` → existing pickers PLUS a `+ New team` tile (opens the same compact form inline, collapsible). Remove the "create teams on the Teams tab first" copy.
- [ ] **Step 2: Players tab read-only** — remove the add form + `useCreatePlayer` import/usage from `players/page.tsx`; delete the now-orphaned `useCreatePlayer` hook from hooks.ts (grep first); rows render `<Avatar>` + name; empty-state hint becomes "Players join when you register a team."
- [ ] **Step 3: Team page mini-form** — under the existing add-existing-player `Select`, add a compact "New player" inline form (name + jersey + optional photo via ImagePicker) calling `useCreateTeamPlayer(teamId)`; roster rows get `<Avatar>`.
- [ ] **Step 4:** Gates + commit `feat(web): dead-end-free match wizard; team-born players`.

---

### Task 7: Avatar rollout + org logo upload

**Files:**

- Modify: `apps/web/src/components/match-card.tsx`, `scoring/scoreboard.tsx`, `scoring/chain-dialog.tsx`, `apps/web/src/app/matches/[id]/live/page.tsx` (player tiles), `apps/web/src/app/players/[id]/page.tsx`, `apps/web/src/app/m/[id]/page.tsx`, `apps/web/src/app/o/[slug]/page.tsx`, `apps/web/src/app/org/page.tsx` (logo section)

- [ ] **Step 1:** Thread `logo`/`photo` through where the data already flows (teams come with `logo`; rosters include `player.photo`). Match card + scoreboard: `Avatar` (team logo, `color` fallback keeps today's bar). Live player tiles + chain dialog: `Avatar` round with jersey/initials fallback. Player profile header + players tab rows: photo avatar. Public pages: same, server-rendered plain `<img>`/fallback markup (no client components) matching `o/[slug]`'s existing pattern.
- [ ] **Step 2:** Org settings: add a logo row using `ImagePicker` (OWNER only) → `apiPatch('/api/orgs/'+id, { logo: url })`, shown beside the org name; `/o/[slug]` already renders `org.logo`.
- [ ] **Step 3:** Gates + commit `feat(web): avatars everywhere; org logo upload`.

---

### Task 8: Authenticated e2e + full gate + final review + rollout

**Files:**

- Create: `apps/web/tests-e2e/setup/auth.setup.ts`, `apps/web/tests-e2e/wizard.spec.ts`
- Modify: `apps/web/playwright.config.ts`

**Interfaces:** none — verification and shipping.

- [ ] **Step 1: Playwright auth storageState** — `auth.setup.ts` (Node, runs as a Playwright "setup" project): create a fresh user via the admin client (reuse the retry pattern; env from `apps/api/.env` via dotenv path), `generateLink` → `verifyOtp({ type:'magiclink', token_hash })` with the anon client (env from `apps/web/.env`) → write a storageState JSON whose `origins[0].localStorage` contains key `sb-<project-ref>-auth-token` (ref parsed from `NEXT_PUBLIC_SUPABASE_URL`) with the session JSON — the exact shape `@supabase/supabase-js` persists (`{ access_token, refresh_token, expires_at, expires_in, token_type: 'bearer', user }`). Register in `playwright.config.ts` as a dependency project; the new spec uses `storageState`. Teardown deletes the user (retry).
- [ ] **Step 2: `wizard.spec.ts`** — authenticated fresh user (zero teams): `/matches/new` → expect the embedded "Create your first team" form (NOT empty pickers) → register "E2E Home FC" (no players) → form reappears for the second team → register "E2E Away FC" → team pickers now show both → select them → reach lineups step → complete → match created (lands on live screen). Second test in the same file — **error-state smoke** (covers the spec's QueryErrorState/branch-logic unit intent, which isn't unit-testable without adding React Testing Library — recorded deviation): `page.route('**/api/teams', route => route.abort())` before visiting `/matches/new` → expect the "Couldn't load" card with a Retry button, and NOT the create-team form; un-route, click Retry, expect recovery. Keep selectors accessible-first (`getByRole`/`getByLabel`).
- [ ] **Step 3: Full gate** — `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build`, then e2e: API dev server up (health-poll), `pnpm test:e2e` → old 3 specs + wizard spec green. Kill only what you started.
- [ ] **Step 4: Final whole-branch review** — controller dispatches the strongest-model reviewer with the branch package + ledger; fix wave for Critical/Important; re-review.
- [ ] **Step 5: Rollout** — merge `--ff-only` to main, push; CI green → Railway (org+media API) + Vercel deploy; prod smoke: upload probe (create user → upload 1×1 PNG via API → fetch URL → cleanup), `POST /api/players` returns 404, register-team round-trip, wizard reachable. Ledger + memory close-out; delete branch.

## Done criteria

- A brand-new account can go from empty dashboard to a started match entirely inside the wizard (proven by e2e).
- Player creation exists only via team registration / team page; `POST /api/players` is 404 in production.
- Logos and player photos upload (cropped, 512² WebP) to Supabase Storage and render across the app with graceful fallbacks.
- No data screen can render blankness on a failed query — every one shows retryable errors.
- Full gate + e2e green; final review passed; production smoke green.
