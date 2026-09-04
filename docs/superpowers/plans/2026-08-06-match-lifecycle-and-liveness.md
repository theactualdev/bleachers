# Match Lifecycle & Viewer Liveness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Matches can end, the match clock survives reloads, and every viewing surface (dashboard, match detail, public share link) updates on its own while a match is live.

**Architecture:** All clock/lifecycle math lives as pure functions in `@bleachers/sport-engine` (unit-tested, no DB). The API stores three new columns on `match` and exposes one transition endpoint (`POST /api/matches/:id/clock`) that applies the pure function server-side. The web derives display time from `(periodStartedAt, pausedElapsedMs)` + a ticking `Date.now()`, so reload/lock/throttle cannot corrupt it. Liveness is polling via TanStack Query `refetchInterval` — the socket gateway stays untouched for a later phase.

**Tech Stack:** NestJS + Prisma (API), Next.js 15 App Router + TanStack Query (web), Zod (`@bleachers/types`), Vitest (unit), Playwright (e2e).

**Source spec:** `docs/audits/sofascore-blend-audit.md` §3.0–3.2 + §3.1 cross-links. This plan is Phase A (audit items 0, 1, 2). Items 3–5 and 6–7 get their own plans after this lands.

## Global Constraints

- Monorepo commands run from repo root with `pnpm --filter <pkg>`; packages are `@bleachers/types`, `@bleachers/sport-engine`, `@bleachers/api`, `@bleachers/web`.
- CI order is `format:check → lint → typecheck → prisma:deploy → test → build`; run `pnpm format:check` (repo root) before every commit — unformatted files are the #1 historical CI killer here.
- Commit messages: no Co-Authored-By trailer, no generated-with footer (user rule).
- The only database is production Supabase. Do NOT write DB-backed tests for new logic; test pure functions in `packages/sport-engine`. Migrations must be additive (nullable or defaulted columns only).
- Do not modify `apps/web/public/`, the service worker route, or `railway.json` — deploy plumbing is settled.
- Status strings are exactly `SCHEDULED | LIVE | PAUSED | COMPLETED | ABANDONED` (Prisma enum `MatchStatus`).
- Clock semantics: `pausedElapsedMs` = banked milliseconds while not running; `periodStartedAt` = wall-clock ISO when the clock last started running, `null` when stopped. Elapsed = `pausedElapsedMs + (now − periodStartedAt when running)`. The clock is cumulative across periods (no per-period reset).
- Offline exemption: `POST /api/sync/events` and event **void** must keep working regardless of match status. Only interactive `record` and `undo` are status-guarded.

---

### Task 1: Pure clock engine in sport-engine

**Files:**

- Create: `packages/sport-engine/src/engine/clock.ts`
- Create: `packages/sport-engine/src/engine/clock.test.ts`
- Modify: `packages/sport-engine/src/index.ts` (add exports)

**Interfaces:**

- Consumes: nothing (pure module).
- Produces (later tasks import these exact names from `@bleachers/sport-engine`):
  - `type MatchLifecycleStatus = 'SCHEDULED' | 'LIVE' | 'PAUSED' | 'COMPLETED' | 'ABANDONED'`
  - `interface MatchClockState { status: MatchLifecycleStatus; periodStartedAt: string | null; pausedElapsedMs: number; currentPeriod: number }`
  - `type ClockActionInput = { action: 'KICKOFF' | 'PAUSE' | 'RESUME' | 'END' | 'ABANDON' | 'SET_PERIOD'; period?: number }`
  - `deriveElapsedMs(state: Pick<MatchClockState, 'periodStartedAt' | 'pausedElapsedMs'>, nowMs: number): number`
  - `applyClockAction(state: MatchClockState, input: ClockActionInput, nowMs: number, maxPeriod: number): MatchClockState` — throws `ClockTransitionError` on invalid transitions
  - `canRecordInteractive(status: MatchLifecycleStatus): boolean` — true for LIVE and PAUSED
  - `class ClockTransitionError extends Error`

- [ ] **Step 1: Write the failing tests**

Create `packages/sport-engine/src/engine/clock.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  applyClockAction,
  canRecordInteractive,
  ClockTransitionError,
  deriveElapsedMs,
  type MatchClockState,
} from './clock.js';

const T0 = 1_700_000_000_000;

const scheduled: MatchClockState = {
  status: 'SCHEDULED',
  periodStartedAt: null,
  pausedElapsedMs: 0,
  currentPeriod: 1,
};

describe('deriveElapsedMs', () => {
  it('returns banked time when the clock is stopped', () => {
    expect(deriveElapsedMs({ periodStartedAt: null, pausedElapsedMs: 90_000 }, T0)).toBe(90_000);
  });

  it('adds wall-clock time since start when running', () => {
    const state = { periodStartedAt: new Date(T0).toISOString(), pausedElapsedMs: 60_000 };
    expect(deriveElapsedMs(state, T0 + 30_000)).toBe(90_000);
  });

  it('never goes negative on clock skew', () => {
    const state = { periodStartedAt: new Date(T0).toISOString(), pausedElapsedMs: 0 };
    expect(deriveElapsedMs(state, T0 - 5_000)).toBe(0);
  });
});

describe('applyClockAction', () => {
  it('KICKOFF starts a scheduled match live with a running clock', () => {
    const next = applyClockAction(scheduled, { action: 'KICKOFF' }, T0, 3);
    expect(next).toEqual({
      status: 'LIVE',
      periodStartedAt: new Date(T0).toISOString(),
      pausedElapsedMs: 0,
      currentPeriod: 1,
    });
  });

  it('PAUSE banks elapsed time and stops the clock', () => {
    const live = applyClockAction(scheduled, { action: 'KICKOFF' }, T0, 3);
    const next = applyClockAction(live, { action: 'PAUSE' }, T0 + 120_000, 3);
    expect(next.status).toBe('PAUSED');
    expect(next.periodStartedAt).toBeNull();
    expect(next.pausedElapsedMs).toBe(120_000);
  });

  it('RESUME restarts the clock without losing banked time', () => {
    const live = applyClockAction(scheduled, { action: 'KICKOFF' }, T0, 3);
    const paused = applyClockAction(live, { action: 'PAUSE' }, T0 + 120_000, 3);
    const resumed = applyClockAction(paused, { action: 'RESUME' }, T0 + 300_000, 3);
    expect(resumed.status).toBe('LIVE');
    expect(resumed.pausedElapsedMs).toBe(120_000);
    expect(deriveElapsedMs(resumed, T0 + 330_000)).toBe(150_000);
  });

  it('END completes the match and banks the final time', () => {
    const live = applyClockAction(scheduled, { action: 'KICKOFF' }, T0, 3);
    const done = applyClockAction(live, { action: 'END' }, T0 + 2_700_000, 3);
    expect(done.status).toBe('COMPLETED');
    expect(done.periodStartedAt).toBeNull();
    expect(done.pausedElapsedMs).toBe(2_700_000);
  });

  it('END also works from PAUSED', () => {
    const live = applyClockAction(scheduled, { action: 'KICKOFF' }, T0, 3);
    const paused = applyClockAction(live, { action: 'PAUSE' }, T0 + 100_000, 3);
    const done = applyClockAction(paused, { action: 'END' }, T0 + 900_000, 3);
    expect(done.status).toBe('COMPLETED');
    expect(done.pausedElapsedMs).toBe(100_000);
  });

  it('ABANDON is allowed from SCHEDULED, LIVE and PAUSED', () => {
    expect(applyClockAction(scheduled, { action: 'ABANDON' }, T0, 3).status).toBe('ABANDONED');
    const live = applyClockAction(scheduled, { action: 'KICKOFF' }, T0, 3);
    expect(applyClockAction(live, { action: 'ABANDON' }, T0 + 1_000, 3).status).toBe('ABANDONED');
  });

  it('SET_PERIOD updates the period within bounds and keeps the clock running', () => {
    const live = applyClockAction(scheduled, { action: 'KICKOFF' }, T0, 3);
    const p2 = applyClockAction(live, { action: 'SET_PERIOD', period: 2 }, T0 + 10, 3);
    expect(p2.currentPeriod).toBe(2);
    expect(p2.status).toBe('LIVE');
    expect(p2.periodStartedAt).toBe(live.periodStartedAt);
  });

  it('rejects SET_PERIOD out of range or without a period', () => {
    const live = applyClockAction(scheduled, { action: 'KICKOFF' }, T0, 3);
    expect(() => applyClockAction(live, { action: 'SET_PERIOD', period: 4 }, T0, 3)).toThrow(
      ClockTransitionError,
    );
    expect(() => applyClockAction(live, { action: 'SET_PERIOD' }, T0, 3)).toThrow(
      ClockTransitionError,
    );
  });

  it('rejects invalid transitions with a readable message', () => {
    expect(() => applyClockAction(scheduled, { action: 'PAUSE' }, T0, 3)).toThrow(
      ClockTransitionError,
    );
    const live = applyClockAction(scheduled, { action: 'KICKOFF' }, T0, 3);
    const done = applyClockAction(live, { action: 'END' }, T0 + 1, 3);
    expect(() => applyClockAction(done, { action: 'RESUME' }, T0 + 2, 3)).toThrow(/completed/i);
    expect(() => applyClockAction(live, { action: 'KICKOFF' }, T0 + 1, 3)).toThrow(
      ClockTransitionError,
    );
  });
});

describe('canRecordInteractive', () => {
  it('allows LIVE and PAUSED only', () => {
    expect(canRecordInteractive('LIVE')).toBe(true);
    expect(canRecordInteractive('PAUSED')).toBe(true);
    expect(canRecordInteractive('SCHEDULED')).toBe(false);
    expect(canRecordInteractive('COMPLETED')).toBe(false);
    expect(canRecordInteractive('ABANDONED')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @bleachers/sport-engine exec vitest run src/engine/clock.test.ts`
Expected: FAIL — cannot resolve `./clock.js`.

- [ ] **Step 3: Implement the module**

Create `packages/sport-engine/src/engine/clock.ts`:

```ts
/**
 * Match lifecycle + clock as pure state transitions.
 *
 * The clock is never a counter — it is derived from wall-clock timestamps, so
 * a page reload, a locked phone, or a throttled background tab cannot lose or
 * drift time. `pausedElapsedMs` banks time while stopped; `periodStartedAt`
 * marks when the clock last started running (null = stopped). The clock is
 * cumulative across periods.
 */

export type MatchLifecycleStatus = 'SCHEDULED' | 'LIVE' | 'PAUSED' | 'COMPLETED' | 'ABANDONED';

export interface MatchClockState {
  status: MatchLifecycleStatus;
  periodStartedAt: string | null;
  pausedElapsedMs: number;
  currentPeriod: number;
}

export type ClockActionInput = {
  action: 'KICKOFF' | 'PAUSE' | 'RESUME' | 'END' | 'ABANDON' | 'SET_PERIOD';
  period?: number;
};

export class ClockTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClockTransitionError';
  }
}

export function deriveElapsedMs(
  state: Pick<MatchClockState, 'periodStartedAt' | 'pausedElapsedMs'>,
  nowMs: number,
): number {
  if (!state.periodStartedAt) return state.pausedElapsedMs;
  const running = nowMs - Date.parse(state.periodStartedAt);
  return state.pausedElapsedMs + Math.max(0, running);
}

/** Bank whatever is on the clock and stop it. */
function stopped(
  state: MatchClockState,
  nowMs: number,
): Pick<MatchClockState, 'periodStartedAt' | 'pausedElapsedMs'> {
  return { periodStartedAt: null, pausedElapsedMs: deriveElapsedMs(state, nowMs) };
}

export function applyClockAction(
  state: MatchClockState,
  input: ClockActionInput,
  nowMs: number,
  maxPeriod: number,
): MatchClockState {
  const fail = (msg: string): never => {
    throw new ClockTransitionError(msg);
  };

  switch (input.action) {
    case 'KICKOFF':
      if (state.status !== 'SCHEDULED')
        fail(`Cannot kick off a ${state.status.toLowerCase()} match`);
      return {
        status: 'LIVE',
        periodStartedAt: new Date(nowMs).toISOString(),
        pausedElapsedMs: 0,
        currentPeriod: 1,
      };

    case 'PAUSE':
      if (state.status !== 'LIVE') fail(`Cannot pause a ${state.status.toLowerCase()} match`);
      return { ...state, status: 'PAUSED', ...stopped(state, nowMs) };

    case 'RESUME':
      if (state.status !== 'PAUSED') fail(`Cannot resume a ${state.status.toLowerCase()} match`);
      return { ...state, status: 'LIVE', periodStartedAt: new Date(nowMs).toISOString() };

    case 'END':
      if (state.status !== 'LIVE' && state.status !== 'PAUSED')
        fail(`Cannot end a ${state.status.toLowerCase()} match`);
      return { ...state, status: 'COMPLETED', ...stopped(state, nowMs) };

    case 'ABANDON':
      if (state.status === 'COMPLETED' || state.status === 'ABANDONED')
        fail(`Cannot abandon a ${state.status.toLowerCase()} match`);
      return { ...state, status: 'ABANDONED', ...stopped(state, nowMs) };

    case 'SET_PERIOD': {
      if (state.status !== 'LIVE' && state.status !== 'PAUSED')
        fail(`Cannot change period of a ${state.status.toLowerCase()} match`);
      const p = input.period;
      if (p === undefined || !Number.isInteger(p) || p < 1 || p > maxPeriod)
        fail(`Period must be between 1 and ${maxPeriod}`);
      return { ...state, currentPeriod: p as number };
    }
  }
}

/** Interactive recording (live screen taps + undo) is only valid mid-match. */
export function canRecordInteractive(status: MatchLifecycleStatus): boolean {
  return status === 'LIVE' || status === 'PAUSED';
}
```

Append to `packages/sport-engine/src/index.ts` (after the career export line):

```ts
export {
  applyClockAction,
  canRecordInteractive,
  ClockTransitionError,
  deriveElapsedMs,
  type ClockActionInput,
  type MatchClockState,
  type MatchLifecycleStatus,
} from './engine/clock.js';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @bleachers/sport-engine exec vitest run src/engine/clock.test.ts`
Expected: PASS (12 tests). Then run the whole package: `pnpm --filter @bleachers/sport-engine test` — all existing tests still pass.

- [ ] **Step 5: Build and commit**

```bash
pnpm --filter @bleachers/sport-engine build
pnpm format:check
git add packages/sport-engine/src/engine/clock.ts packages/sport-engine/src/engine/clock.test.ts packages/sport-engine/src/index.ts
git commit -m "feat(engine): pure match clock and lifecycle transitions

Derived, not counted: elapsed time comes from wall-clock timestamps plus a
banked total, so reloads and throttled tabs cannot lose or drift time. All
transitions (kickoff/pause/resume/end/abandon/set-period) are validated
pure functions with unit tests, ready for the API to apply server-side."
```

---

### Task 2: Schema columns, types, serializer

**Files:**

- Modify: `apps/api/prisma/schema.prisma` (Match model, lines 162–189)
- Create: migration via `prisma migrate dev --name match_clock`
- Modify: `packages/types/src/match.ts` (MatchSchema + new ClockActionSchema)
- Modify: `apps/api/src/common/serialize.ts:57-72` (`toMatch`)
- Create: `apps/api/test/serialize.spec.ts`

**Interfaces:**

- Consumes: nothing.
- Produces:
  - Prisma columns on `match`: `periodStartedAt DateTime?`, `pausedElapsedMs Int @default(0)`, `currentPeriod Int @default(1)`
  - `MatchSchema` gains `periodStartedAt: string | null`, `pausedElapsedMs: number`, `currentPeriod: number` (so every serialized match carries clock state)
  - `ClockActionSchema` / `type ClockActionRequest` in `@bleachers/types`

- [ ] **Step 1: Write the failing serializer test**

Create `apps/api/test/serialize.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { toMatch } from '../src/common/serialize.js';

describe('toMatch', () => {
  it('serializes clock fields, ISO-encoding the running timestamp', () => {
    const started = new Date('2026-08-01T15:00:00.000Z');
    const m = toMatch({
      id: '9f883634-7013-4435-b948-ba5f26581c18',
      sport: 'FOOTBALL',
      homeTeamId: '11111111-1111-4111-8111-111111111111',
      awayTeamId: '22222222-2222-4222-8222-222222222222',
      venue: null,
      scheduledAt: started,
      status: 'LIVE',
      statTier: 'BASIC',
      competitionId: null,
      createdById: '33333333-3333-4333-8333-333333333333',
      organizationId: '44444444-4444-4444-8444-444444444444',
      createdAt: started,
      updatedAt: started,
      periodStartedAt: started,
      pausedElapsedMs: 60_000,
      currentPeriod: 2,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    expect(m.periodStartedAt).toBe('2026-08-01T15:00:00.000Z');
    expect(m.pausedElapsedMs).toBe(60_000);
    expect(m.currentPeriod).toBe(2);
  });

  it('serializes a stopped clock as null', () => {
    const now = new Date();
    const m = toMatch({
      id: '9f883634-7013-4435-b948-ba5f26581c18',
      sport: 'FOOTBALL',
      homeTeamId: '11111111-1111-4111-8111-111111111111',
      awayTeamId: '22222222-2222-4222-8222-222222222222',
      venue: null,
      scheduledAt: now,
      status: 'SCHEDULED',
      statTier: 'BASIC',
      competitionId: null,
      createdById: '33333333-3333-4333-8333-333333333333',
      organizationId: '44444444-4444-4444-8444-444444444444',
      createdAt: now,
      updatedAt: now,
      periodStartedAt: null,
      pausedElapsedMs: 0,
      currentPeriod: 1,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    expect(m.periodStartedAt).toBeNull();
    expect(m.currentPeriod).toBe(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @bleachers/api exec vitest run test/serialize.spec.ts`
Expected: FAIL — `m.periodStartedAt` is `undefined` (field not serialized yet).

- [ ] **Step 3: Add the schema columns and migrate**

In `apps/api/prisma/schema.prisma`, inside `model Match`, after the `statTier` line add:

```prisma
  // ── Derived-clock state (see @bleachers/sport-engine clock.ts) ───────────
  // Wall-clock instant the clock last started running; null while stopped.
  periodStartedAt DateTime?
  // Milliseconds banked while the clock was stopped (pause, half-time, FT).
  pausedElapsedMs Int       @default(0)
  currentPeriod   Int       @default(1)
```

Run (additive, safe on the shared DB):

```bash
pnpm --filter @bleachers/api exec prisma migrate dev --name match_clock
pnpm --filter @bleachers/api exec prisma generate
```

Expected: new folder under `apps/api/prisma/migrations/*match_clock/` and "Your database is now in sync".

- [ ] **Step 4: Extend MatchSchema and add ClockActionSchema**

In `packages/types/src/match.ts`, inside `MatchSchema` after `statTier: StatTierSchema,` add:

```ts
  /** Clock: wall-clock start of the current running span, null while stopped. */
  periodStartedAt: z.string().datetime({ offset: true }).nullable(),
  /** Clock: milliseconds banked while stopped. Elapsed = banked + (now - periodStartedAt). */
  pausedElapsedMs: z.number().int().min(0),
  currentPeriod: z.number().int().min(1),
```

At the end of the file add:

```ts
// ─── Lifecycle / clock transitions (POST /api/matches/:id/clock) ─────────────

export const ClockActionSchema = z
  .object({
    action: z.enum(['KICKOFF', 'PAUSE', 'RESUME', 'END', 'ABANDON', 'SET_PERIOD']),
    period: z.number().int().min(1).max(12).optional(),
  })
  .refine((a) => a.action !== 'SET_PERIOD' || a.period !== undefined, {
    message: 'period is required for SET_PERIOD',
  });
export type ClockActionRequest = z.infer<typeof ClockActionSchema>;
```

In `apps/api/src/common/serialize.ts`, inside `toMatch` after `statTier: m.statTier,` add:

```ts
    periodStartedAt: m.periodStartedAt ? iso(m.periodStartedAt) : null,
    pausedElapsedMs: m.pausedElapsedMs,
    currentPeriod: m.currentPeriod,
```

- [ ] **Step 5: Rebuild types, run the test, typecheck**

```bash
pnpm --filter @bleachers/types build
pnpm --filter @bleachers/api exec vitest run test/serialize.spec.ts
pnpm typecheck
```

Expected: serialize tests PASS; `pnpm typecheck` passes across the workspace (web compiles against the widened MatchSchema without changes because it only adds fields).

- [ ] **Step 6: Commit**

```bash
pnpm format:check
git add apps/api/prisma apps/api/src/common/serialize.ts apps/api/test/serialize.spec.ts packages/types/src/match.ts
git commit -m "feat(api): persist match clock state and serialize it

Three additive columns on match (periodStartedAt, pausedElapsedMs,
currentPeriod) carried on every serialized match, plus the ClockAction
request schema. Elapsed time is derived from these on any surface, which
is what makes the clock reload-proof."
```

---

### Task 3: Clock endpoint + status guard on interactive recording

**Files:**

- Modify: `apps/api/src/matches/matches.service.ts` (replace dead `setStatus` with `clock`; set clock fields on `startNow` create)
- Modify: `apps/api/src/matches/matches.controller.ts` (add route)
- Modify: `apps/api/src/events/events.service.ts` (guard `record` + `undoLast`)
- Create: `apps/api/test/match-clock.spec.ts`

**Interfaces:**

- Consumes: `applyClockAction`, `canRecordInteractive`, `ClockTransitionError` from `@bleachers/sport-engine`; `ClockActionSchema`/`ClockActionRequest` from `@bleachers/types`.
- Produces: `POST /api/matches/:id/clock` accepting `{ action, period? }`, returning the serialized match (same shape as `GET /api/matches/:id` minus relations — the web invalidates and refetches, it does not merge). Service method: `clock(userId: string, id: string, input: ClockActionRequest): Promise<Match>`.

- [ ] **Step 1: Write the failing service test (mock Prisma, no DB)**

Create `apps/api/test/match-clock.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MatchesService } from '../src/matches/matches.service.js';

function makeMatch(overrides: Record<string, unknown> = {}) {
  const now = new Date();
  return {
    id: '9f883634-7013-4435-b948-ba5f26581c18',
    sport: 'FOOTBALL',
    homeTeamId: '11111111-1111-4111-8111-111111111111',
    awayTeamId: '22222222-2222-4222-8222-222222222222',
    venue: null,
    scheduledAt: now,
    status: 'SCHEDULED',
    statTier: 'BASIC',
    competitionId: null,
    createdById: 'u1',
    organizationId: 'org1',
    createdAt: now,
    updatedAt: now,
    periodStartedAt: null,
    pausedElapsedMs: 0,
    currentPeriod: 1,
    ...overrides,
  };
}

describe('MatchesService.clock', () => {
  let stored: ReturnType<typeof makeMatch>;
  let service: MatchesService;

  beforeEach(() => {
    stored = makeMatch();
    const prisma = {
      match: {
        findUnique: vi.fn(async () => stored),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          stored = { ...stored, ...data };
          return stored;
        }),
      },
    };
    const members = { assertMember: vi.fn(async () => undefined) };
    // Constructor deps beyond prisma/members are not exercised by clock().
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new MatchesService(prisma as any, members as any);
  });

  it('KICKOFF flips SCHEDULED to LIVE with a running clock', async () => {
    const m = await service.clock('u1', stored.id, { action: 'KICKOFF' });
    expect(m.status).toBe('LIVE');
    expect(m.periodStartedAt).not.toBeNull();
    expect(m.currentPeriod).toBe(1);
  });

  it('END from LIVE banks elapsed time and completes', async () => {
    stored = makeMatch({
      status: 'LIVE',
      periodStartedAt: new Date(Date.now() - 60_000),
      pausedElapsedMs: 0,
    });
    const m = await service.clock('u1', stored.id, { action: 'END' });
    expect(m.status).toBe('COMPLETED');
    expect(m.periodStartedAt).toBeNull();
    expect(m.pausedElapsedMs).toBeGreaterThanOrEqual(60_000);
  });

  it('maps invalid transitions to BadRequest', async () => {
    stored = makeMatch({ status: 'COMPLETED' });
    await expect(service.clock('u1', stored.id, { action: 'RESUME' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects SET_PERIOD beyond the sport maximum', async () => {
    stored = makeMatch({ status: 'LIVE', periodStartedAt: new Date() });
    await expect(
      service.clock('u1', stored.id, { action: 'SET_PERIOD', period: 99 }),
    ).rejects.toThrow(BadRequestException);
  });
});
```

Note: check `MatchesService`'s constructor before finalising the mock — if it takes more than `(prisma, members)`, pass additional `{}` stubs in positional order; `clock()` must only use these two.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @bleachers/api exec vitest run test/match-clock.spec.ts`
Expected: FAIL — `service.clock is not a function`.

- [ ] **Step 3: Implement service + controller + guard**

In `apps/api/src/matches/matches.service.ts`:

Add to imports:

```ts
import {
  applyClockAction,
  canRecordInteractive, // (only if you also guard here; events guard lives in events.service)
  ClockTransitionError,
  getSportConfig,
} from '@bleachers/sport-engine';
import type { ClockActionRequest } from '@bleachers/types';
```

(Drop `canRecordInteractive` from this import if unused in this file after wiring — lint will tell you.)

In `create(...)`, where `status: input.startNow ? 'LIVE' : 'SCHEDULED'` is set (line ~100), extend the created data so a startNow match begins with a running clock:

```ts
        status: input.startNow ? 'LIVE' : 'SCHEDULED',
        periodStartedAt: input.startNow ? new Date() : null,
        pausedElapsedMs: 0,
        currentPeriod: 1,
```

Replace the entire dead `setStatus` method (lines ~146–156) with:

```ts
  /**
   * All lifecycle/clock transitions go through here so the clock math is
   * applied server-side and atomically with the status change. Invalid
   * transitions surface as 400s with the engine's message.
   */
  async clock(userId: string, id: string, input: ClockActionRequest) {
    await this.members.assertMember(userId, await this.orgOf(id), 'SCORER');
    const m = await this.prisma.match.findUnique({ where: { id } });
    if (!m) throw new NotFoundException('Match not found');

    const config = getSportConfig(m.sport);
    const maxPeriod = config.periods.regulationCount + config.periods.extraTimeCount + 1;

    let next;
    try {
      next = applyClockAction(
        {
          status: m.status,
          periodStartedAt: m.periodStartedAt?.toISOString() ?? null,
          pausedElapsedMs: m.pausedElapsedMs,
          currentPeriod: m.currentPeriod,
        },
        input,
        Date.now(),
        maxPeriod,
      );
    } catch (err) {
      if (err instanceof ClockTransitionError) throw new BadRequestException(err.message);
      throw err;
    }

    const updated = await this.prisma.match.update({
      where: { id },
      data: {
        status: next.status,
        periodStartedAt: next.periodStartedAt ? new Date(next.periodStartedAt) : null,
        pausedElapsedMs: next.pausedElapsedMs,
        currentPeriod: next.currentPeriod,
      },
    });
    return toMatch(updated);
  }
```

Ensure `BadRequestException` and `NotFoundException` are imported from `@nestjs/common` in this file.

In `apps/api/src/matches/matches.controller.ts`, add to imports `ClockActionSchema, type ClockActionRequest` from `@bleachers/types`, and after the `update` route add:

```ts
  @Post(':id/clock')
  clock(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ClockActionSchema)) body: ClockActionRequest,
  ) {
    return this.matches.clock(user.id, id, body);
  }
```

In `apps/api/src/events/events.service.ts`, import `canRecordInteractive` from `@bleachers/sport-engine`. In `record(...)` immediately after `const match = await this.getMatchOrThrow(input.matchId);` add:

```ts
if (!canRecordInteractive(match.status)) {
  throw new BadRequestException(
    'Match is not in progress — events can only be recorded while it is live or paused',
  );
}
```

In `undoLast(...)`, change `await this.getMatchOrThrow(matchId);` to capture and guard identically:

```ts
const match = await this.getMatchOrThrow(matchId);
if (!canRecordInteractive(match.status)) {
  throw new BadRequestException(
    'Match is not in progress — undo is only available while it is live or paused',
  );
}
```

Deliberately do NOT touch `void(...)` or `batchUpload(...)` — corrections after full time and late offline syncs are legitimate (Global Constraints).

- [ ] **Step 4: Run tests and typecheck**

```bash
pnpm --filter @bleachers/api exec vitest run test/match-clock.spec.ts test/serialize.spec.ts test/auth-guard.spec.ts
pnpm --filter @bleachers/api typecheck
```

Expected: all PASS. If the wizard-era integration specs are run they still pass — `record` guard permits LIVE, and e2e matches are created `startNow`.

- [ ] **Step 5: Commit**

```bash
pnpm format:check
git add apps/api/src apps/api/test/match-clock.spec.ts
git commit -m "feat(api): clock transition endpoint; guard interactive recording

POST /api/matches/:id/clock applies the engine's pure transitions
server-side (kickoff, pause, resume, end, abandon, set-period), replacing
the dead setStatus method. Interactive record and undo now require a
live or paused match; void and offline batch sync stay exempt because
post-match corrections and late syncs are legitimate."
```

---

### Task 4: Web plumbing — clock hook, ticking now, polling options

**Files:**

- Create: `apps/web/src/lib/use-now.ts`
- Modify: `apps/web/src/lib/hooks.ts` (`useMatchStats`, `useMatch`, `useMatches`; add `useMatchClock`)
- Create: `apps/web/src/lib/use-now.test.ts` (colocated, matches existing vitest setup in `apps/web`)

**Interfaces:**

- Consumes: `apiPost` from `@/lib/api`; `ClockActionRequest`, `Match` from `@bleachers/types`.
- Produces (used by Tasks 5–7):
  - `useNow(active: boolean): number` — epoch ms, ticking every second while `active`, frozen otherwise
  - `isInPlay(status: string): boolean` — LIVE or PAUSED
  - `useMatchClock(id: string)` — mutation; `mutate({ action, period? })`; invalidates `['match', orgId, id]`, `['matches', orgId]`, `['match-stats', orgId, id]` — **already implemented** (landed with the Task 3 review fix, which needed a kickoff action once the tap grid became status-gated); verify it matches this shape rather than re-adding it
  - `useMatch(id, opts?: { refetchMs?: number })`, `useMatchStats(id, opts?: { refetchMs?: number })` — polling opt-in
  - `useMatches()` — self-polling every 15 s whenever its own data contains a LIVE match

- [ ] **Step 1: Write the failing test for the pure piece**

Create `apps/web/src/lib/use-now.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isInPlay } from './use-now';

describe('isInPlay', () => {
  it('is true only while the match is live or paused', () => {
    expect(isInPlay('LIVE')).toBe(true);
    expect(isInPlay('PAUSED')).toBe(true);
    expect(isInPlay('SCHEDULED')).toBe(false);
    expect(isInPlay('COMPLETED')).toBe(false);
    expect(isInPlay('ABANDONED')).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @bleachers/web exec vitest run src/lib/use-now.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `apps/web/src/lib/use-now.ts`:

```ts
'use client';

import { useEffect, useState } from 'react';

/** LIVE or PAUSED — the states where clocks tick and surfaces poll. */
export function isInPlay(status: string): boolean {
  return status === 'LIVE' || status === 'PAUSED';
}

/**
 * Epoch-ms "now" that re-renders once a second while `active`. Display-only:
 * elapsed time is always re-derived from server timestamps against this, so a
 * throttled or resumed tab snaps to the correct value on the next tick.
 */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}
```

In `apps/web/src/lib/hooks.ts`:

Add `ClockActionRequest` and `Match` to the existing `@bleachers/types` type imports.

Replace `useMatches` (line ~229) with:

```ts
export const useMatches = () => {
  const orgId = useActiveOrgId();
  return useQuery({
    queryKey: ['matches', orgId],
    queryFn: () => apiGet<MatchWithTeams[]>('/api/matches'),
    enabled: !!orgId,
    // Live-by-default for viewers: while any match is live, keep the list fresh.
    refetchInterval: (query) =>
      query.state.data?.some((m) => m.status === 'LIVE') ? 15_000 : false,
  });
};
```

Replace `useMatch` and `useMatchStats` with polling-capable versions (same keys, added options param — all existing call sites compile unchanged):

```ts
export const useMatch = (id: string, opts?: { refetchMs?: number }) => {
  const orgId = useActiveOrgId();
  return useQuery({
    queryKey: ['match', orgId, id],
    queryFn: () => apiGet<MatchDetail>(`/api/matches/${id}`),
    enabled: !!id && !!orgId,
    refetchInterval: opts?.refetchMs ?? false,
  });
};
```

```ts
export const useMatchStats = (id: string, opts?: { refetchMs?: number }) => {
  const orgId = useActiveOrgId();
  return useQuery({
    queryKey: ['match-stats', orgId, id],
    queryFn: () => apiGet<MatchStats>(`/api/matches/${id}/stats`),
    enabled: !!id && !!orgId,
    refetchInterval: opts?.refetchMs ?? false,
  });
};
```

After `useCreateMatch` add:

```ts
/** Lifecycle/clock transitions. The server owns the math; we just refetch. */
export function useMatchClock(id: string) {
  const qc = useQueryClient();
  const orgId = useActiveOrgId();
  return useMutation({
    mutationFn: (input: ClockActionRequest) => apiPost<Match>(`/api/matches/${id}/clock`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['match', orgId, id] });
      qc.invalidateQueries({ queryKey: ['matches', orgId] });
      qc.invalidateQueries({ queryKey: ['match-stats', orgId, id] });
    },
  });
}
```

- [ ] **Step 4: Run tests and typecheck**

```bash
pnpm --filter @bleachers/web exec vitest run
pnpm --filter @bleachers/web typecheck
```

Expected: all web tests PASS (existing 10 + new), typecheck clean.

- [ ] **Step 5: Commit**

```bash
pnpm format:check
git add apps/web/src/lib/use-now.ts apps/web/src/lib/use-now.test.ts apps/web/src/lib/hooks.ts
git commit -m "feat(web): clock mutation, ticking-now hook, opt-in polling

useMatchClock posts lifecycle transitions; useNow re-derives display time
each second from server timestamps; useMatches polls itself while any
match is live, and useMatch/useMatchStats accept a refetch interval."
```

---

### Task 5: Live-scoring screen on the derived clock, with Full time

**Files:**

- Modify: `apps/web/src/app/matches/[id]/live/page.tsx`

**Interfaces:**

- Consumes: `useMatchClock`, `useNow`, `isInPlay` (Task 4); `deriveElapsedMs` from `@bleachers/sport-engine`; match clock fields (Task 2).
- Produces: nothing programmatic — behaviour: kickoff for SCHEDULED, pause/resume server-backed, period via API, Full time (two-tap confirm) navigating to `/matches/:id`, Abandon (two-tap) likewise; every recorded event stamps derived `clockMs` and the server-side `currentPeriod`.

- [ ] **Step 1: Remove the local clock state**

Delete these lines (currently ~37–44):

```tsx
const [running, setRunning] = useState(true);
const [elapsedMs, setElapsedMs] = useState(0);
const [period, setPeriod] = useState(1);
useEffect(() => {
  if (!running) return;
  const t = setInterval(() => setElapsedMs((e) => e + 1000), 1000);
  return () => clearInterval(t);
}, [running]);
```

Replace with:

```tsx
const clock = useMatchClock(id);
const status = match?.status ?? 'SCHEDULED';
const now = useNow(status === 'LIVE');
const elapsedMs = match ? deriveElapsedMs(match, now) : 0;
const period = match?.currentPeriod ?? 1;
const running = status === 'LIVE';
// Two-tap confirms for destructive lifecycle actions.
const [confirming, setConfirming] = useState<null | 'END' | 'ABANDON'>(null);
useEffect(() => {
  if (!confirming) return;
  const t = setTimeout(() => setConfirming(null), 4000);
  return () => clearTimeout(t);
}, [confirming]);
```

Add imports: `useMatchClock` to the `@/lib/hooks` import, `useNow` from `@/lib/use-now`, `deriveElapsedMs` from `@bleachers/sport-engine`, `useRouter` from `next/navigation`, `Flag` and `XCircle` from `lucide-react`. Add `const router = useRouter();` beside the other hooks. If `useEffect` is not yet imported from react in this file, add it.

- [ ] **Step 2: Rewire the top-bar controls**

Replace the pause/play button (`onClick={() => setRunning((r) => !r)}`) with:

```tsx
<Button
  variant="ghost"
  size="sm"
  disabled={clock.isPending || !isInPlay(status)}
  onClick={() => clock.mutate({ action: running ? 'PAUSE' : 'RESUME' })}
>
  {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
</Button>
```

Import `isInPlay` from `@/lib/use-now`. After the Undo button, add Full time + Abandon:

```tsx
          <Button
            variant={confirming === 'END' ? 'default' : 'ghost'}
            size="sm"
            disabled={clock.isPending || !isInPlay(status)}
            onClick={() => {
              if (confirming !== 'END') return setConfirming('END');
              clock.mutate(
                { action: 'END' },
                { onSuccess: () => router.push(`/matches/${id}`) },
              );
            }}
          >
            <Flag className="h-4 w-4" /> {confirming === 'END' ? 'Confirm FT' : 'Full time'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label={confirming === 'ABANDON' ? 'Confirm abandon' : 'Abandon match'}
            disabled={clock.isPending || status === 'COMPLETED' || status === 'ABANDONED'}
            onClick={() => {
              if (confirming !== 'ABANDON') return setConfirming('ABANDON');
              clock.mutate(
                { action: 'ABANDON' },
                { onSuccess: () => router.push(`/matches/${id}`) },
              );
            }}
          >
            <XCircle className={cn('h-4 w-4', confirming === 'ABANDON' && 'text-negative')} />
          </Button>
```

(If the Button component has no `default` variant, use the primary/brand variant name found in `apps/web/src/components/ui/button.tsx` — check it, don't guess.)

- [ ] **Step 3: Kickoff state for scheduled matches, period via API**

A kickoff banner already sits immediately after the `<Scoreboard … />` element (Task 3 review fix), inside the `!canScore` block that also explains COMPLETED/ABANDONED. Keep that block and fold the derived status into it rather than adding a second one; the shape it should end up as:

```tsx
{
  status === 'SCHEDULED' && (
    <Button
      size="lg"
      className="w-full"
      disabled={clock.isPending}
      onClick={() => clock.mutate({ action: 'KICKOFF' })}
    >
      <Play className="h-5 w-5" /> Kick off
    </Button>
  );
}
```

Change the period selector button's handler from `onClick={() => setPeriod(p)}` to:

```tsx
              onClick={() => clock.mutate({ action: 'SET_PERIOD', period: p })}
```

and add `disabled={clock.isPending || !isInPlay(status)}` to it.

The `Scoreboard` call keeps `clockLabel={formatClock(elapsedMs)}` and `periodLabel={...period...}` — both now read derived values. Everything that previously read the deleted `elapsedMs`/`period` state (the `record`/event handlers around lines 93 and 120) now reads the derived `const`s of the same names — no further edits there.

- [ ] **Step 4: Verify in the browser**

```bash
# dev servers: web on :3007 (launch config "web-alt"), API on :4000 with
# WEB_ORIGIN="http://localhost:3000,http://localhost:3007"
```

Manual pass (or the browser pane): create a match with "Start match now" → clock ticks from 00:00; reload the page → clock continues (does not reset); Pause → clock freezes, badge state changes; Resume → continues; Full time (two taps) → lands on `/matches/:id`; back on the live URL the tap grid and Undo must be disabled and the page must say scoring is closed. Note the refusal is client-side (`canScore` in the page, already in place): taps reach the server through `POST /api/sync/events`, which stays status-exempt by design, so no server 400 arrives for a tap — only interactive `record`/`undo` are guarded server-side. `pnpm --filter @bleachers/web build` compiles.

- [ ] **Step 5: Commit**

```bash
pnpm format:check
git add "apps/web/src/app/matches/[id]/live/page.tsx"
git commit -m "feat(web): live screen runs on the server-derived clock

Kickoff, pause/resume, period changes and full time are all server
transitions now; elapsed time is derived from timestamps every second, so
a reload or locked phone resumes with the correct minute instead of
00:00. Full time and abandon use a two-tap confirm and land on the match
detail page."
```

---

### Task 6: Match detail + dashboard — status-aware header, polling, cross-links

**Files:**

- Modify: `apps/web/src/app/matches/[id]/page.tsx`
- Modify: `apps/web/src/components/scoreboard.tsx` (add optional `homeHref` / `awayHref` props — check the exact filename with `ls apps/web/src/components | grep -i score` first; it is the component both match pages import as `Scoreboard`)
- Modify: `apps/web/src/app/teams/[id]/page.tsx` (roster rows → player links)

**Interfaces:**

- Consumes: `useNow`, `isInPlay`, `useMatch`/`useMatchStats` polling opts (Task 4); `deriveElapsedMs` (Task 1); clock fields (Task 2).
- Produces: `Scoreboard` accepts `homeHref?: string; awayHref?: string` — when set, team name+mark render inside a `next/link`; when unset (live screen), plain text as today.

- [ ] **Step 1: Scoreboard link props**

In the Scoreboard component, extend the props type with `homeHref?: string; awayHref?: string;` and wrap each team block:

```tsx
// pattern for each side; keep existing classNames exactly
const HomeBlock = <>{/* existing mark + name markup, unchanged */}</>;
return homeHref ? (
  <Link href={homeHref} className="min-w-0">
    {HomeBlock}
  </Link>
) : (
  HomeBlock
);
```

Concretely: wrap the existing home-side flex container's children in `<Link href={homeHref}>` only when the prop is present (`import Link from 'next/link'`), same for away. Do not change any styling classes; the link is transparent chrome.

- [ ] **Step 2: Match detail header + polling + links**

In `apps/web/src/app/matches/[id]/page.tsx`:

Replace the two hook lines with polling-aware versions:

```tsx
const {
  data: match,
  isLoading,
  isError,
  error,
  refetch,
} = useMatch(id, {
  refetchMs: undefined,
});
const inPlay = isInPlay(match?.status ?? '');
const { data: stats } = useMatchStats(id, { refetchMs: inPlay ? 10_000 : undefined });
```

then change the first call to `useMatch(id, { refetchMs: inPlay ? 10_000 : undefined })` — since `inPlay` derives from its own result, define it as:

```tsx
const {
  data: match,
  isLoading,
  isError,
  error,
  refetch,
} = useMatch(id, {
  refetchMs: 10_000,
});
```

Simpler and correct: always poll the (cheap) match row at 10 s on this page and gate only stats:

```tsx
const { data: match, isLoading, isError, error, refetch } = useMatch(id, { refetchMs: 10_000 });
const inPlay = isInPlay(match?.status ?? '');
const { data: stats } = useMatchStats(id, { refetchMs: inPlay ? 10_000 : undefined });
const now = useNow(match?.status === 'LIVE');
```

Replace `clockLabel={match.status}` on the Scoreboard with a real label:

```tsx
          clockLabel={
            match.status === 'COMPLETED'
              ? 'FT'
              : match.status === 'ABANDONED'
                ? 'Abandoned'
                : match.status === 'SCHEDULED'
                  ? new Date(match.scheduledAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : formatClock(deriveElapsedMs(match, now))
          }
```

Add `homeHref={`/teams/${match.homeTeamId}`}` and `awayHref={`/teams/${match.awayTeamId}`}` to the Scoreboard. Imports: `deriveElapsedMs` from `@bleachers/sport-engine`, `formatClock` from `@/lib/utils`, `useNow, isInPlay` from `@/lib/use-now`.

Also hide "Score live" for finished matches — the existing condition already only shows it for LIVE/SCHEDULED; extend it to include PAUSED:

```tsx
          {(match.status === 'LIVE' || match.status === 'PAUSED' || match.status === 'SCHEDULED') && (
```

Cross-links on this page: wrap the timeline player name and the player-stats name in links (keep classes):

```tsx
{
  t.playerId && (
    <Link href={`/players/${t.playerId}`} className="text-ink-3 hover:text-ink-1">
      · {nameOf(t.playerId)}
    </Link>
  );
}
```

```tsx
<p className="text-ink-1 mb-2 text-sm font-semibold">
  <Link href={`/players/${p.playerId}`} className="hover:underline">
    {nameOf(p.playerId)}
  </Link>{' '}
  <span className="text-ink-3 text-xs font-normal">
    {p.side === 'HOME' ? match.homeTeam.name : match.awayTeam.name}
  </span>
</p>
```

`Link` is already imported in this file.

- [ ] **Step 3: Roster rows link to players**

In `apps/web/src/app/teams/[id]/page.tsx`, wrap the roster `<Card>` (the `sortedRoster.map` body) in a link exactly like the players index does:

```tsx
return (
  <Link key={r.id} href={`/players/${r.playerId}`}>
    <Card
      className={`flex items-center gap-3 p-3 transition-opacity ${pending ? 'opacity-60' : ''}`}
    >
      {/* existing Avatar / name / jersey markup unchanged */}
    </Card>
  </Link>
);
```

Move `key` to the Link. Add `import Link from 'next/link';` if absent. Note the surrounding container must use `flex flex-col gap-*` (it already uses `space-y-2` — change it to `flex flex-col gap-2.5`, same fix as the teams index, and for the same inline-anchor margin reason).

- [ ] **Step 4: Verify, typecheck, build**

```bash
pnpm --filter @bleachers/web typecheck && pnpm --filter @bleachers/web build
```

Browser: on a LIVE match's detail page the score/timeline update within 10 s of events recorded in another tab; the header shows a running minute; a COMPLETED match shows "FT"; tapping a team name lands on the team page; tapping a timeline scorer lands on the player page; dashboard "Live now" card score updates without a manual refresh (its `useMatchStats` is polled by the card page-level `useMatches` refetch plus card mount — verify the score moves; if a card's score lags, pass `{ refetchMs: 15_000 }` to `useMatchStats` inside `MatchCard` when `match.status === 'LIVE'`, which is a one-line addition in `apps/web/src/components/match-card.tsx`).

- [ ] **Step 5: Commit**

```bash
pnpm format:check
git add apps/web/src
git commit -m "feat(web): match detail goes live-aware and cross-linked

The detail header shows a real state (running minute, kickoff time, FT,
Abandoned) and polls while the match is in play. Team names on the
scoreboard, scorers in the timeline, player-stat rows and roster rows are
navigation now — the first pass of the audit's no-dead-ends rule."
```

---

### Task 7: Public match page — client polling, live clock, lineups payload

**Files:**

- Modify: `apps/api/src/sharing/sharing.service.ts` (`publicMatch` — add clock fields)
- Modify: `apps/web/src/app/m/[id]/page.tsx` (server component → client component with polling)

**Interfaces:**

- Consumes: clock fields (Task 2), `deriveElapsedMs` (Task 1), `useNow`/`isInPlay` (Task 4).
- Produces: `GET /api/public/matches/:id` `match` object additionally carries `periodStartedAt: string | null`, `pausedElapsedMs: number`, `currentPeriod: number`.

- [ ] **Step 1: Extend the public payload**

In `sharing.service.ts` `publicMatch`, extend the returned `match` object (after `scheduledAt`):

```ts
        periodStartedAt: match.periodStartedAt?.toISOString() ?? null,
        pausedElapsedMs: match.pausedElapsedMs,
        currentPeriod: match.currentPeriod,
```

- [ ] **Step 2: Convert the page to a polling client component**

Rewrite `apps/web/src/app/m/[id]/page.tsx` keeping ALL existing markup (header, score card, TeamMark, timeline, footer links) but swapping the data layer. The shape of the change:

```tsx
'use client';

import { use } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { getEventType, getSportConfig, deriveElapsedMs } from '@bleachers/sport-engine';
import type { MatchStats, Sport } from '@bleachers/types';
import { API_URL } from '@/lib/api-url';
import { isInPlay, useNow } from '@/lib/use-now';
import { formatClock } from '@/lib/utils';

interface PublicTeam {
  /* unchanged */
}
interface PublicMatch {
  match: {
    id: string;
    sport: Sport;
    status: string;
    venue: string | null;
    scheduledAt: string;
    periodStartedAt: string | null;
    pausedElapsedMs: number;
    currentPeriod: number;
  };
  homeTeam: PublicTeam;
  awayTeam: PublicTeam;
  playerNames: Record<string, string>;
  stats: MatchStats;
}

export default function PublicMatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, isLoading } = useQuery({
    queryKey: ['public-match', id],
    queryFn: async (): Promise<PublicMatch | null> => {
      const res = await fetch(`${API_URL}/api/public/matches/${id}`, { cache: 'no-store' });
      if (!res.ok) return null;
      return res.json();
    },
    // The whole point of this page: a shared link that moves on its own.
    refetchInterval: (q) => (q.state.data && isInPlay(q.state.data.match.status) ? 10_000 : false),
  });
  const now = useNow(data?.match.status === 'LIVE');

  if (isLoading) return <div className="text-ink-3 p-8 text-center text-sm">Loading match…</div>;
  if (!data)
    return <div className="text-ink-3 p-8 text-center text-sm">This match could not be found.</div>;

  const { match, homeTeam, awayTeam, playerNames, stats } = data;
  const config = getSportConfig(match.sport);
  const live = match.status === 'LIVE';
  // …existing JSX from here down, unchanged except the two points below…
}
```

Two JSX changes inside the retained markup:

1. The status pill shows the running minute while in play:

```tsx
{
  live && <span className="bg-live h-1.5 w-1.5 animate-pulse rounded-full" />;
}
{
  isInPlay(match.status)
    ? `${formatClock(deriveElapsedMs(match, now))} · ${config.periods.periodLabel} ${match.currentPeriod}`
    : match.status === 'COMPLETED'
      ? 'FT'
      : match.status;
}
```

2. `notFound()` and the `async`/server `getMatch` helper are deleted (replaced by the query above); remove the now-unused `next/navigation` import.

- [ ] **Step 3: Verify**

```bash
pnpm --filter @bleachers/web typecheck && pnpm --filter @bleachers/web build
```

Browser: open `/m/<liveMatchId>` in one tab, record an event from the live screen in another → score and timeline update within 10 s without touching the page; the pill shows a ticking minute; after Full time the pill reads FT and polling stops (network tab goes quiet). A nonsense id renders the not-found message.

- [ ] **Step 4: Commit**

```bash
pnpm format:check
git add apps/api/src/sharing/sharing.service.ts "apps/web/src/app/m/[id]/page.tsx"
git commit -m "feat(public): the shared match page is actually live

The public payload carries clock state, and the page is a polling client
component: score, timeline and a ticking minute update on their own every
10s while the match is in play, and polling stops at full time. This is
the surface a parent on the touchline actually has open."
```

---

### Task 8: End-to-end proof + full gate

**Files:**

- Modify: `apps/web/tests-e2e/wizard.spec.ts` (extend the end-to-end test through full time)

**Interfaces:**

- Consumes: everything above; the e2e wizard flow already reaches the live screen with a startNow match.

- [ ] **Step 1: Extend the wizard e2e through FT**

In `wizard.spec.ts`, at the end of `'fresh user completes the create-match wizard end to end'` (after the two team-name visibility assertions), append:

```ts
// Full time is a two-tap confirm, then lands on the match detail page.
await page.getByRole('button', { name: 'Full time' }).click();
await page.getByRole('button', { name: 'Confirm FT' }).click();
await page.waitForURL(/\/matches\/[^/]+$/, { timeout: 30_000 });
await expect(page.getByText('FT', { exact: true })).toBeVisible({ timeout: 15_000 });
```

- [ ] **Step 2: Run the whole gate exactly as CI does**

```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm --filter @bleachers/web build && pnpm --filter @bleachers/api build
```

Expected: all green. Then e2e (needs web + API running; see Global Constraints for ports and the `.auth/user.json` origin-mirroring note in `docs/audits/sofascore-blend-audit.md` §5):

```bash
pnpm --filter @bleachers/web exec playwright test --reporter=list
```

Expected: all specs pass, including the extended wizard test.

- [ ] **Step 3: Commit and push**

```bash
git add apps/web/tests-e2e/wizard.spec.ts
git commit -m "test(e2e): the wizard flow now ends the match it starts

Extends the end-to-end test through the two-tap full-time confirm and
asserts the detail page shows FT — locking in that matches can finish."
git push origin main
```

- [ ] **Step 4: Post-deploy verification (production)**

After CI goes green and both platforms deploy (confirm with `curl -s https://bleachers-production.up.railway.app/health` — the `commit` field must equal the pushed SHA — and the SW cache stamp on `https://bleacherss.vercel.app/sw.js`): start a real match on a phone, lock the phone for a minute, unlock — the clock must show the true elapsed minute. Open the `/m/:id` link on a second device and watch a recorded goal appear without touching the page. Then tap Full time and confirm the dashboard moves the match out of "Live now".

---

## Self-review notes

- **Spec coverage:** audit §3.0.1 (end-match + guard) → Tasks 1, 3, 5, 8; §3.0.2 (derived clock) → Tasks 1, 2, 3, 5; §3.1 (cross-links: timeline, stats names, team names, roster rows; lineup pickers excluded; public page links deferred until public entity pages exist) → Task 6; §3.2 (public + dashboard + detail liveness, clock on all three) → Tasks 4, 6, 7. Match cards intentionally keep a single link (the card itself) — nested anchors are invalid HTML; deep links live on the detail pages.
- **Known deviation from audit:** polling, not sockets, for v1 liveness (audit explicitly allows this as the first step). The gateway remains for Phase B/C.
- **Type consistency:** `MatchClockState`/`ClockActionInput` (Task 1) ↔ `ClockActionSchema` (Task 2) ↔ `clock()` service (Task 3) ↔ `useMatchClock` (Task 4) all use the same action strings; `periodStartedAt: string | null` ISO everywhere outside Prisma.
- **Placeholder scan:** the two "check before finalising" notes (Button variant name, Scoreboard filename, MatchesService constructor arity) are deliberate look-before-you-edit instructions with concrete fallbacks, not deferred design.
