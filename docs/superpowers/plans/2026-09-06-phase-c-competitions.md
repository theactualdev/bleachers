# Phase C: Competitions & Standings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give matches something to belong to — a competition with a real league table, fixtures, results and top scorers — closing the loop where a recorded goal visibly moves a standing.

**Architecture:** The `Competition` model, its `CompetitionFormat` enum and `Match.competitionId` already exist in the database with nothing above them. This phase builds that missing stack: a pure `computeStandings` fold in `sport-engine`, an org-scoped competitions module mirroring the `teams` module exactly, two aggregate endpoints, and the web surfaces. Standings are derived from completed matches on every request — never stored — the same event-sourced philosophy as `MatchStats`.

**Tech Stack:** NestJS + Prisma (API), Next.js 15 App Router + TanStack Query (web), Zod (`@bleachers/types`), Vitest (unit), Playwright (e2e).

**Source spec:** `docs/audits/sofascore-blend-audit.md` §3.6, §3.7. Phases A and B are merged.

## Global Constraints

- Monorepo commands run from repo root with `pnpm --filter <pkg>`; packages are `@bleachers/types`, `@bleachers/sport-engine`, `@bleachers/api`, `@bleachers/web`.
- CI order is `format:check → lint → typecheck → prisma:deploy → test → build`. Run `pnpm format:check` from the repo root BEFORE every commit and read its exit code directly — never pipe it through `| tail`, which swallows the failure.
- Commit messages: no `Co-Authored-By` trailer, no generated-with footer.
- Do NOT run `git push`. Commit only.
- **No migration in this phase.** The schema already has everything needed. Do not add columns or indexes.
- The only database is the production Supabase project. New logic is tested as pure functions in `packages/sport-engine`; do not add DB-backed tests.
- Do not modify `apps/web/public/`, `apps/web/src/app/sw.js/route.ts`, or `railway.json`.
- Do not run `deno` inside the repo — it rewrites the root `package.json`.

## Verified facts this plan is built on

Established by reading the code. Trust these over intuition.

- **The data model is complete and unused.** `Competition` (`schema.prisma:144-160`) has `id, name, sport, format, createdById, organizationId, createdAt, updatedAt, matches[]` and `@@index([organizationId])`. `CompetitionFormat` (`schema.prisma:73-79`) = KNOCKOUT | ROUND_ROBIN | GROUPS | LADDER | COLLECTION. `Match.competitionId` is nullable with `onDelete: SetNull` and `@@index([competitionId])`.
- **The model has no** description, dates, season, status, slug, logo, or `@@unique(organizationId, name)`. Do not assume any of those exist.
- **Total existing code above the DB is 3 API lines and 4 type lines**: `serialize.ts:70` copies `competitionId` in `toMatch`; `matches.service.ts:113` writes it on create; `matches.service.ts:151` patches it on update; `packages/types/src/match.ts` declares it on the three match schemas. There is **no** competitions controller, service, module, serializer, hook, page or test.
- **`CompetitionFormatSchema` already exists** at `packages/types/src/enums.ts:32-40` and is imported by **zero files**. Reuse it — do not redeclare it.
- **`computeTeamStats(teamId: string, results: readonly TeamMatchResult[]): TeamStats`** (`career.ts:66`) is config-free and `teamId` is pass-through only. `TeamMatchResult` (`career.ts:55-60`) carries **only** `{ goalsFor, goalsAgainst }` — no team ids — so it cannot express a league table. Standings need their own input type.
- **A fifth bottom-nav item is a layout hazard.** At 375px each nav cell is ~63px; the label is `text-[11px]` with **no `truncate` and no `whitespace-nowrap`**, and "Competitions" is ~70-75px, so it would wrap to two lines and — because the row is `items-stretch` — stretch the whole bar and break the `layoutId="nav-active"` pill animation. **This plan therefore adds no nav item**; competitions are reached from the dashboard and from match cards.
- Module registration is `apps/api/src/app.module.ts`, domain modules grouped after infrastructure.
- There is **no composite index** on `(competitionId, status)`. Standings queries filter on the single-column `competitionId` index and then in memory — fine at grassroots scale.

## Deliberate scope

- **ROUND_ROBIN is the only format with a table.** COLLECTION is the no-table bucket (friendlies). KNOCKOUT, GROUPS and LADDER are accepted by the API and render as a collection until their bracket logic is actually designed — four half-built formats would be worse than one that works. The UI says so rather than showing an empty table.
- **Top scorers land here**, not in Phase B where the audit first listed them: the query shape is the same for a competition, so it is written once.
- Standings points are 3/1/0, hard-coded via defaults on the engine function. No per-competition points config in v1.

---

### Task 1: `computeStandings` in the sport engine

**Files:**

- Create: `packages/sport-engine/src/engine/standings.ts`
- Create: `packages/sport-engine/src/engine/standings.test.ts`
- Modify: `packages/sport-engine/src/index.ts`

**Interfaces:**

- Produces (imported by later tasks from `@bleachers/sport-engine`):
  - `interface StandingsMatchResult { homeTeamId: string; awayTeamId: string; homeGoals: number; awayGoals: number }`
  - `interface StandingsRow { teamId: string; played: number; won: number; drawn: number; lost: number; goalsFor: number; goalsAgainst: number; goalDifference: number; points: number }`
  - `computeStandings(results: readonly StandingsMatchResult[], opts?: { win?: number; draw?: number }): StandingsRow[]`

- [ ] **Step 1: Write the failing tests**

Create `packages/sport-engine/src/engine/standings.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { computeStandings, type StandingsMatchResult } from './standings.js';

const r = (
  homeTeamId: string,
  homeGoals: number,
  awayTeamId: string,
  awayGoals: number,
): StandingsMatchResult => ({ homeTeamId, awayTeamId, homeGoals, awayGoals });

describe('computeStandings', () => {
  it('returns an empty table for no results', () => {
    expect(computeStandings([])).toEqual([]);
  });

  it('awards 3 for a win and 0 for a loss', () => {
    const [top, bottom] = computeStandings([r('a', 2, 'b', 1)]);
    expect(top).toMatchObject({ teamId: 'a', played: 1, won: 1, lost: 0, points: 3 });
    expect(bottom).toMatchObject({ teamId: 'b', played: 1, won: 0, lost: 1, points: 0 });
  });

  it('awards 1 point each for a draw', () => {
    const rows = computeStandings([r('a', 1, 'b', 1)]);
    expect(rows.every((x) => x.points === 1 && x.drawn === 1)).toBe(true);
  });

  it('accumulates goals for and against from both fixtures', () => {
    const rows = computeStandings([r('a', 3, 'b', 0), r('b', 2, 'a', 1)]);
    const a = rows.find((x) => x.teamId === 'a')!;
    expect(a).toMatchObject({ played: 2, won: 1, lost: 1, goalsFor: 4, goalsAgainst: 2 });
    expect(a.goalDifference).toBe(2);
  });

  it('orders by points, then goal difference, then goals scored', () => {
    // c and b both finish on 3 points; c has the better difference.
    const rows = computeStandings([r('a', 5, 'b', 0), r('c', 3, 'd', 0), r('b', 1, 'd', 0)]);
    expect(rows[0]!.teamId).toBe('a'); // 3 pts, +5
    expect(rows[1]!.teamId).toBe('c'); // 3 pts, +3
    expect(rows[2]!.teamId).toBe('b'); // 3 pts, -4
  });

  it('breaks a total tie deterministically by teamId', () => {
    const rows = computeStandings([r('z', 1, 'a', 1)]);
    expect(rows.map((x) => x.teamId)).toEqual(['a', 'z']);
  });

  it('honours custom points values', () => {
    const [top] = computeStandings([r('a', 1, 'b', 0)], { win: 2 });
    expect(top!.points).toBe(2);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @bleachers/sport-engine exec vitest run src/engine/standings.test.ts`
Expected: FAIL — cannot resolve `./standings.js`.

- [ ] **Step 3: Implement**

Create `packages/sport-engine/src/engine/standings.ts`:

```ts
/**
 * League table as a pure fold over finished matches.
 *
 * Deliberately separate from `TeamMatchResult` in career.ts: that shape carries
 * only goals for/against from one team's view and cannot say who played whom,
 * which is exactly what a table needs. Nothing here is persisted — standings are
 * recomputed per request, the same way MatchStats is.
 */

export interface StandingsMatchResult {
  homeTeamId: string;
  awayTeamId: string;
  homeGoals: number;
  awayGoals: number;
}

export interface StandingsRow {
  teamId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

function blank(teamId: string): StandingsRow {
  return {
    teamId,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0,
  };
}

export function computeStandings(
  results: readonly StandingsMatchResult[],
  opts: { win?: number; draw?: number } = {},
): StandingsRow[] {
  const win = opts.win ?? 3;
  const draw = opts.draw ?? 1;
  const table = new Map<string, StandingsRow>();
  const row = (id: string) => {
    const existing = table.get(id);
    if (existing) return existing;
    const fresh = blank(id);
    table.set(id, fresh);
    return fresh;
  };

  for (const m of results) {
    const home = row(m.homeTeamId);
    const away = row(m.awayTeamId);

    home.played += 1;
    away.played += 1;
    home.goalsFor += m.homeGoals;
    home.goalsAgainst += m.awayGoals;
    away.goalsFor += m.awayGoals;
    away.goalsAgainst += m.homeGoals;

    if (m.homeGoals > m.awayGoals) {
      home.won += 1;
      home.points += win;
      away.lost += 1;
    } else if (m.homeGoals < m.awayGoals) {
      away.won += 1;
      away.points += win;
      home.lost += 1;
    } else {
      home.drawn += 1;
      away.drawn += 1;
      home.points += draw;
      away.points += draw;
    }
  }

  for (const r of table.values()) r.goalDifference = r.goalsFor - r.goalsAgainst;

  // Points, then goal difference, then goals scored — and finally teamId so the
  // order is stable for identical rows rather than depending on insertion order.
  return [...table.values()].sort(
    (a, b) =>
      b.points - a.points ||
      b.goalDifference - a.goalDifference ||
      b.goalsFor - a.goalsFor ||
      a.teamId.localeCompare(b.teamId),
  );
}
```

Append to `packages/sport-engine/src/index.ts`:

```ts
export {
  computeStandings,
  type StandingsMatchResult,
  type StandingsRow,
} from './engine/standings.js';
```

- [ ] **Step 4: Verify and commit**

```bash
pnpm --filter @bleachers/sport-engine exec vitest run src/engine/standings.test.ts
pnpm --filter @bleachers/sport-engine test
pnpm --filter @bleachers/sport-engine build
pnpm format:check
```

All must pass with `format:check` exit 0.

```bash
git add packages/sport-engine/src/engine/standings.ts packages/sport-engine/src/engine/standings.test.ts packages/sport-engine/src/index.ts
git commit -m "feat(engine): league standings as a pure fold

Points, goal difference and ordering computed from finished matches with no
database access, mirroring how MatchStats is derived rather than stored.
Needs its own input type: TeamMatchResult carries only goals for/against
from one side's view and cannot express who played whom."
```

---

### Task 2: Competition types

**Files:**

- Create: `packages/types/src/competition.ts`
- Modify: `packages/types/src/index.ts`

**Interfaces:**

- Produces: `CompetitionSchema` / `Competition`, `CreateCompetitionSchema` / `CreateCompetitionInput`, `UpdateCompetitionSchema` / `UpdateCompetitionInput`, `StandingsEntrySchema` / `StandingsEntry`, `TopScorerSchema` / `TopScorer`.

- [ ] **Step 1: Create the module**

First check how `packages/types/src/index.ts` re-exports (`cat packages/types/src/index.ts`) and follow that style exactly.

Create `packages/types/src/competition.ts`:

```ts
import { z } from 'zod';
import { IdSchema } from './common.js';
import { CompetitionFormatSchema, SportSchema } from './enums.js';

/**
 * A competition groups matches. `CompetitionFormatSchema` already existed in
 * enums.ts (unused until now) — reused rather than redeclared.
 */
export const CompetitionSchema = z.object({
  id: IdSchema,
  name: z.string().min(1).max(120),
  sport: SportSchema,
  format: CompetitionFormatSchema,
  createdById: IdSchema,
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});
export type Competition = z.infer<typeof CompetitionSchema>;

export const CreateCompetitionSchema = z.object({
  name: z.string().min(1).max(120),
  sport: SportSchema,
  format: CompetitionFormatSchema,
});
export type CreateCompetitionInput = z.infer<typeof CreateCompetitionSchema>;

export const UpdateCompetitionSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  format: CompetitionFormatSchema.optional(),
});
export type UpdateCompetitionInput = z.infer<typeof UpdateCompetitionSchema>;

/** One row of a league table. Derived per request, never stored. */
export const StandingsEntrySchema = z.object({
  teamId: IdSchema,
  teamName: z.string(),
  played: z.number().int(),
  won: z.number().int(),
  drawn: z.number().int(),
  lost: z.number().int(),
  goalsFor: z.number().int(),
  goalsAgainst: z.number().int(),
  goalDifference: z.number().int(),
  points: z.number().int(),
});
export type StandingsEntry = z.infer<typeof StandingsEntrySchema>;

/** A scorer within one competition, most goals first. */
export const TopScorerSchema = z.object({
  playerId: IdSchema,
  playerName: z.string(),
  goals: z.number().int(),
});
export type TopScorer = z.infer<typeof TopScorerSchema>;
```

Add the re-export line to `packages/types/src/index.ts` in the same style as its neighbours (e.g. `export * from './competition.js';`).

- [ ] **Step 2: Verify and commit**

```bash
pnpm --filter @bleachers/types build
pnpm --filter @bleachers/types test
pnpm typecheck
pnpm format:check
```

```bash
git add packages/types/src/competition.ts packages/types/src/index.ts
git commit -m "feat(types): competition, standings and top-scorer contracts

CompetitionFormatSchema has sat in enums.ts imported by nothing since the
schema was written; these reuse it rather than declaring a second copy."
```

---

### Task 3: Competitions API module

**Files:**

- Create: `apps/api/src/competitions/competitions.module.ts`
- Create: `apps/api/src/competitions/competitions.service.ts`
- Create: `apps/api/src/competitions/competitions.controller.ts`
- Modify: `apps/api/src/common/serialize.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**

- Consumes: types from Task 2.
- Produces: `toCompetition(c: PrismaCompetition): Competition` in `serialize.ts`; routes `GET /api/competitions`, `POST /api/competitions`, `GET /api/competitions/:id`, `PATCH /api/competitions/:id`.

- [ ] **Step 1: Read the pattern before writing**

Read `apps/api/src/teams/teams.controller.ts`, `teams.service.ts` and `teams.module.ts` in full. Mirror them exactly: the same decorator stack, the same `CurrentOrgId` / `CurrentUser` usage, the same `ZodValidationPipe` application, the same `assertMember` role levels (read = `VIEWER`, write = `SCORER`, per the teams module — confirm and match whatever it actually uses). Do not invent a different structure.

- [ ] **Step 2: Add the serializer**

In `apps/api/src/common/serialize.ts`, following the existing `toMatch` / `toTeam` style (note how they import Prisma row types and use the local `iso()` helper):

```ts
export function toCompetition(c: PrismaCompetition): Competition {
  return {
    id: c.id,
    name: c.name,
    sport: c.sport,
    format: c.format,
    createdById: c.createdById,
    createdAt: iso(c.createdAt),
    updatedAt: iso(c.updatedAt),
  };
}
```

Add `Competition as PrismaCompetition` to the `@prisma/client` type import and `Competition` to the `@bleachers/types` type import, matching how the other serializers in this file are wired.

- [ ] **Step 3: Write the service**

Create `apps/api/src/competitions/competitions.service.ts`:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import type { CreateCompetitionInput, UpdateCompetitionInput } from '@bleachers/types';
import { PrismaService } from '../prisma/prisma.service.js';
import { MembershipService } from '../orgs/membership.service.js';
import { toCompetition } from '../common/serialize.js';

@Injectable()
export class CompetitionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly members: MembershipService,
  ) {}

  /** The competition's org, for authorising by id alone. */
  private async orgOf(id: string): Promise<string> {
    const c = await this.prisma.competition.findUnique({
      where: { id },
      select: { organizationId: true },
    });
    if (!c) throw new NotFoundException('Competition not found');
    return c.organizationId;
  }

  async list(userId: string, orgId: string) {
    await this.members.assertMember(userId, orgId, 'VIEWER');
    const rows = await this.prisma.competition.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toCompetition);
  }

  async get(userId: string, id: string) {
    await this.members.assertMember(userId, await this.orgOf(id), 'VIEWER');
    const c = await this.prisma.competition.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Competition not found');
    return toCompetition(c);
  }

  async create(userId: string, orgId: string, input: CreateCompetitionInput) {
    await this.members.assertMember(userId, orgId, 'SCORER');
    const c = await this.prisma.competition.create({
      data: {
        name: input.name,
        sport: input.sport,
        format: input.format,
        createdById: userId,
        organizationId: orgId,
      },
    });
    return toCompetition(c);
  }

  async update(userId: string, id: string, input: UpdateCompetitionInput) {
    await this.members.assertMember(userId, await this.orgOf(id), 'SCORER');
    const c = await this.prisma.competition.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.format !== undefined ? { format: input.format } : {}),
      },
    });
    return toCompetition(c);
  }
}
```

- [ ] **Step 4: Controller and module**

Create `apps/api/src/competitions/competitions.controller.ts`, mirroring `teams.controller.ts`:

```ts
import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import {
  CreateCompetitionSchema,
  UpdateCompetitionSchema,
  type CreateCompetitionInput,
  type UpdateCompetitionInput,
} from '@bleachers/types';
import { CurrentUser } from '../auth/auth.decorators.js';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentOrgId } from '../orgs/org.decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CompetitionsService } from './competitions.service.js';

@Controller('competitions')
export class CompetitionsController {
  constructor(private readonly competitions: CompetitionsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @CurrentOrgId() orgId: string) {
    return this.competitions.list(user.id, orgId);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.competitions.get(user.id, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @CurrentOrgId() orgId: string,
    @Body(new ZodValidationPipe(CreateCompetitionSchema)) body: CreateCompetitionInput,
  ) {
    return this.competitions.create(user.id, orgId, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateCompetitionSchema)) body: UpdateCompetitionInput,
  ) {
    return this.competitions.update(user.id, id, body);
  }
}
```

Create `competitions.module.ts` copying `teams.module.ts`'s exact shape (same imports/providers/controllers arrangement), then register `CompetitionsModule` in `apps/api/src/app.module.ts` in the domain group — place it directly after `MatchesModule`.

- [ ] **Step 5: Verify and commit**

```bash
pnpm typecheck
pnpm --filter @bleachers/api lint
pnpm --filter @bleachers/api build
pnpm format:check
```

```bash
git add apps/api/src/competitions apps/api/src/common/serialize.ts apps/api/src/app.module.ts
git commit -m "feat(api): competitions CRUD

The Competition model has been in the schema since the initial migration with
no code above it. An org-scoped module mirroring teams: viewers read, scorers
create and edit."
```

---

### Task 4: Standings and top scorers endpoints

**Files:**

- Modify: `apps/api/src/competitions/competitions.service.ts`
- Modify: `apps/api/src/competitions/competitions.controller.ts`
- Modify: `apps/api/src/matches/matches.controller.ts`
- Modify: `apps/api/src/matches/matches.service.ts`

**Interfaces:**

- Produces: `GET /api/competitions/:id/standings` → `StandingsEntry[]`; `GET /api/competitions/:id/top-scorers` → `TopScorer[]`; `GET /api/matches?competitionId=<uuid>`.

- [ ] **Step 1: Standings + top scorers in the service**

Add to `competitions.service.ts` (extend the imports: `computeStandings` and `reduceMatch`/`getSportConfig` from `@bleachers/sport-engine`, `toEvent` from `../common/serialize.js`, and the `StandingsEntry`/`TopScorer` types):

```ts
  /**
   * League table, derived from this competition's COMPLETED matches only.
   * An in-progress match has no result to contribute.
   */
  async standings(userId: string, id: string): Promise<StandingsEntry[]> {
    await this.members.assertMember(userId, await this.orgOf(id), 'VIEWER');

    const matches = await this.prisma.match.findMany({
      where: { competitionId: id, status: 'COMPLETED' },
      include: {
        homeTeam: { select: { id: true, name: true } },
        awayTeam: { select: { id: true, name: true } },
        events: { where: { voided: false } },
      },
    });

    const names = new Map<string, string>();
    const results = matches.map((m) => {
      const config = getSportConfig(m.sport);
      const stats = reduceMatch(config, m.id, m.events.map(toEvent), m.statTier);
      names.set(m.homeTeam.id, m.homeTeam.name);
      names.set(m.awayTeam.id, m.awayTeam.name);
      return {
        homeTeamId: m.homeTeamId,
        awayTeamId: m.awayTeamId,
        homeGoals: stats.score[0],
        awayGoals: stats.score[1],
      };
    });

    return computeStandings(results).map((row) => ({
      ...row,
      teamName: names.get(row.teamId) ?? 'Team',
    }));
  }

  /**
   * Scorers across the competition. Scoring events are whatever the sport config
   * marks as scoring — the same judgement the timeline uses — so this stays
   * correct for sports where a score is not one goal.
   */
  async topScorers(userId: string, id: string): Promise<TopScorer[]> {
    await this.members.assertMember(userId, await this.orgOf(id), 'VIEWER');

    const matches = await this.prisma.match.findMany({
      where: { competitionId: id, status: 'COMPLETED' },
      include: { events: { where: { voided: false } } },
    });

    const goals = new Map<string, number>();
    for (const m of matches) {
      const config = getSportConfig(m.sport);
      const stats = reduceMatch(config, m.id, m.events.map(toEvent), m.statTier);
      for (const entry of stats.timeline) {
        if (!entry.isScoring || !entry.playerId) continue;
        goals.set(entry.playerId, (goals.get(entry.playerId) ?? 0) + 1);
      }
    }
    if (goals.size === 0) return [];

    const players = await this.prisma.player.findMany({
      where: { id: { in: [...goals.keys()] } },
      select: { id: true, name: true },
    });
    const names = new Map(players.map((p) => [p.id, p.name]));

    return [...goals.entries()]
      .map(([playerId, count]) => ({
        playerId,
        playerName: names.get(playerId) ?? 'Player',
        goals: count,
      }))
      .sort((a, b) => b.goals - a.goals || a.playerName.localeCompare(b.playerName));
  }
```

- [ ] **Step 2: Routes**

Add to `competitions.controller.ts`:

```ts
  @Get(':id/standings')
  standings(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.competitions.standings(user.id, id);
  }

  @Get(':id/top-scorers')
  topScorers(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.competitions.topScorers(user.id, id);
  }
```

**Order matters:** these must be declared BEFORE the existing `@Get(':id')` handler, or Nest matches `:id` first and `standings` never fires. Move them above it.

- [ ] **Step 3: competitionId filter on the matches list**

In `matches.controller.ts`, add a second optional query param alongside the existing `teamId`:

```ts
    @Query('competitionId', new ParseUUIDPipe({ optional: true })) competitionId?: string,
```

and pass it through. In `matches.service.ts`, widen the signature to `list(userId, orgId, teamId?, competitionId?)` and add to the `where`:

```ts
        ...(competitionId ? { competitionId } : {}),
```

- [ ] **Step 4: Verify and commit**

```bash
pnpm typecheck && pnpm --filter @bleachers/api lint && pnpm --filter @bleachers/api build
pnpm format:check
```

```bash
git add apps/api/src/competitions apps/api/src/matches
git commit -m "feat(api): standings, top scorers, and a competitionId match filter

Both aggregates fold COMPLETED matches through the existing engine rather
than storing anything. Top scorers count timeline entries the sport config
marks as scoring, so the definition of a goal stays with the sport."
```

---

### Task 5: Web hooks and the competitions list

**Files:**

- Modify: `apps/web/src/lib/hooks.ts`
- Create: `apps/web/src/app/competitions/page.tsx`
- Create: `apps/web/src/app/competitions/new/page.tsx`

**Interfaces:**

- Produces: `useCompetitions()`, `useCompetition(id)`, `useStandings(id)`, `useTopScorers(id)`, `useCompetitionMatches(id)`, `useCreateCompetition()`.

- [ ] **Step 1: Hooks**

Add the new types to the `@bleachers/types` import in `hooks.ts`, then add (mirroring the existing `useTeams` / `useCreateTeam` pair exactly — read them first):

```ts
// ── Competitions ─────────────────────────────────────────────────────────────
export const useCompetitions = () => {
  const orgId = useActiveOrgId();
  return useQuery({
    queryKey: ['competitions', orgId],
    queryFn: () => apiGet<Competition[]>('/api/competitions'),
    enabled: !!orgId,
  });
};

export const useCompetition = (id: string) => {
  const orgId = useActiveOrgId();
  return useQuery({
    queryKey: ['competition', orgId, id],
    queryFn: () => apiGet<Competition>(`/api/competitions/${id}`),
    enabled: !!id && !!orgId,
  });
};

export const useStandings = (id: string) => {
  const orgId = useActiveOrgId();
  return useQuery({
    queryKey: ['standings', orgId, id],
    queryFn: () => apiGet<StandingsEntry[]>(`/api/competitions/${id}/standings`),
    enabled: !!id && !!orgId,
  });
};

export const useTopScorers = (id: string) => {
  const orgId = useActiveOrgId();
  return useQuery({
    queryKey: ['top-scorers', orgId, id],
    queryFn: () => apiGet<TopScorer[]>(`/api/competitions/${id}/top-scorers`),
    enabled: !!id && !!orgId,
  });
};

export const useCompetitionMatches = (id: string) => {
  const orgId = useActiveOrgId();
  return useQuery({
    queryKey: ['matches', orgId, 'competition', id],
    queryFn: () => apiGet<MatchWithTeams[]>(`/api/matches?competitionId=${id}`),
    enabled: !!id && !!orgId,
  });
};

export function useCreateCompetition() {
  const qc = useQueryClient();
  const orgId = useActiveOrgId();
  return useMutation({
    mutationFn: (input: CreateCompetitionInput) => apiPost<Competition>('/api/competitions', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['competitions', orgId] }),
  });
}
```

- [ ] **Step 2: List page**

Create `apps/web/src/app/competitions/page.tsx` modelled closely on `apps/web/src/app/teams/page.tsx` (read it first and copy its structure: `AuthGate`, `PageHeader` with a "New" action, the loading/error/empty/list branch chain, and **`flex flex-col gap-2.5`** for the list — not `space-y`, because the rows are `Link`s and vertical margins do not apply to inline elements).

Each row: competition name, plus a muted subtitle of the format in sentence case (`ROUND_ROBIN` → `Round robin`) and its sport. Link to `/competitions/{id}`.

- [ ] **Step 3: Create page**

Create `apps/web/src/app/competitions/new/page.tsx` modelled on `apps/web/src/app/teams/new/page.tsx`: a name `Input`, a format selector, and a sport selector defaulting to `FOOTBALL`. On success `router.push('/competitions/' + created.id)`.

For the format selector reuse the `TierButton` pattern from `apps/web/src/app/matches/new/page.tsx` (a labelled button with `aria-pressed` and a full-strength border when selected) rather than a raw `<select>`. Offer **ROUND_ROBIN** ("League table") and **COLLECTION** ("Just a group of matches") prominently; the other three formats may be offered but the copy must say a table is not generated for them yet.

- [ ] **Step 4: Verify and commit**

```bash
pnpm typecheck && pnpm --filter @bleachers/web lint && pnpm --filter @bleachers/web build
pnpm format:check
```

```bash
git add apps/web/src/lib/hooks.ts apps/web/src/app/competitions
git commit -m "feat(web): competitions list and creation"
```

---

### Task 6: Competition detail — table, fixtures, results, scorers

**Files:**

- Create: `apps/web/src/components/standings-table.tsx`
- Create: `apps/web/src/app/competitions/[id]/page.tsx`

**Interfaces:**

- Consumes: hooks from Task 5; `MatchCard` from `@/components/match-card`.

- [ ] **Step 1: Standings table component**

Create `apps/web/src/components/standings-table.tsx`:

```tsx
'use client';

import Link from 'next/link';
import type { StandingsEntry } from '@bleachers/types';

/**
 * A league table sized for a phone: position, team, played, goal difference and
 * points. W/D/L are dropped on purpose — at 375px eight numeric columns are
 * unreadable, and P/GD/Pts are what anyone actually scans for.
 */
export function StandingsTable({ rows }: { rows: StandingsEntry[] }) {
  if (rows.length === 0) return null;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-eyebrow text-ink-3">
          <th className="w-6 py-1 text-left font-normal">#</th>
          <th className="py-1 text-left font-normal">Team</th>
          <th className="w-8 py-1 text-right font-normal">P</th>
          <th className="w-10 py-1 text-right font-normal">GD</th>
          <th className="w-8 py-1 text-right font-normal">Pts</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.teamId} className="border-hairline border-t">
            <td className="tabnums text-ink-3 py-2">{i + 1}</td>
            <td className="text-ink-1 truncate py-2 font-medium">
              <Link href={`/teams/${r.teamId}`} className="hover:underline">
                {r.teamName}
              </Link>
            </td>
            <td className="tabnums text-ink-2 py-2 text-right">{r.played}</td>
            <td className="tabnums text-ink-2 py-2 text-right">
              {r.goalDifference > 0 ? `+${r.goalDifference}` : r.goalDifference}
            </td>
            <td className="tabnums text-ink-1 py-2 text-right font-bold">{r.points}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 2: Detail page**

Create `apps/web/src/app/competitions/[id]/page.tsx` following the structure of `apps/web/src/app/teams/[id]/page.tsx` (`use(params)`, `AuthGate`, `PageHeader`, a `space-y-4 px-4 py-2` container). Sections in order:

1. **Header** — competition name as an `h1` in the established `font-display text-ink-1 text-2xl font-bold tracking-tight` style, with the format and sport as a muted line beneath.
2. **Standings** — a `Card` titled "Table" containing `<StandingsTable rows={standings ?? []} />`, rendered **only when `competition.format === 'ROUND_ROBIN'`**. For any other format render nothing here; for KNOCKOUT/GROUPS/LADDER add a muted line reading `Tables aren't generated for this format yet.` so the absence is explained rather than mysterious.
3. **Top scorers** — a `Card` listing player name (linked to `/players/{playerId}`) and goal count, only when the list is non-empty.
4. **Fixtures** then **Results**, each a heading plus `flex flex-col gap-2.5` of `MatchCard`s, split from `useCompetitionMatches` by status exactly as the club page does (`COMPLETED`/`ABANDONED` are results; `SCHEDULED`/`LIVE`/`PAUSED` are fixtures).

- [ ] **Step 3: Verify and commit**

```bash
pnpm typecheck && pnpm --filter @bleachers/web lint && pnpm --filter @bleachers/web build
pnpm format:check
```

```bash
git add apps/web/src/components/standings-table.tsx "apps/web/src/app/competitions/[id]"
git commit -m "feat(web): competition page with table, scorers and fixtures

The table renders only for ROUND_ROBIN; other formats say so rather than
showing an empty grid. Five columns, not eight — at 375px P/GD/Pts is what
is actually readable."
```

---

### Task 7: Cross-links and the home feed

**Files:**

- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/app/matches/[id]/page.tsx`

**Interfaces:** none new.

- [ ] **Step 1: Competition entry point on the dashboard**

Read `apps/web/src/app/page.tsx` in full first, including its local `Section` and `StaggerItem` components.

**No bottom-nav item is added** — see Verified Facts: at 375px a fifth cell is ~63px and the label "Competitions" is ~70-75px with no truncation, so it would wrap, stretch the `items-stretch` row, and break the shared-layout pill animation.

Instead, add a modest "Competitions" section to the dashboard beneath the match sections: when `useCompetitions()` returns any, list them as links to `/competitions/{id}`; always end the section with a link to `/competitions`. Use the page's existing `Section` component so the heading style matches.

- [ ] **Step 2: Competition label on the match page**

On `apps/web/src/app/matches/[id]/page.tsx`, when `match.competitionId` is set, render the competition name under the page header as a link to `/competitions/{match.competitionId}`. Fetch it with `useCompetition(match.competitionId ?? '')` — the hook is already `enabled`-guarded on a falsy id, so an unlinked match makes no request.

This is the last edge of the audit's loop: match → competition → its other matches.

- [ ] **Step 3: Verify and commit**

```bash
pnpm typecheck && pnpm --filter @bleachers/web lint && pnpm --filter @bleachers/web build
pnpm format:check
```

```bash
git add apps/web/src/app/page.tsx "apps/web/src/app/matches/[id]/page.tsx"
git commit -m "feat(web): reach competitions from the dashboard and the match page

Deliberately not a fifth nav item: at 375px that cell is ~63px and the
label does not fit, and since nav labels have no truncation it would wrap,
stretch the row and break the active-pill animation."
```

---

### Task 8: Full gate

**Files:** none — verification only.

- [ ] **Step 1: Run the gate exactly as CI does**

```bash
pnpm format:check; echo "format=$?"
pnpm lint; echo "lint=$?"
pnpm typecheck; echo "typecheck=$?"
pnpm test
pnpm --filter @bleachers/web build && pnpm --filter @bleachers/api build
```

Expected: all green. `pnpm test` should show the Phase B baseline (types 3, engine 34, web 18, api 52) plus the new `standings` tests.

- [ ] **Step 2: Report**

Summarise each command and result, the new test counts, and anything unverified. Do not push.

---

## Self-review notes

- **Spec coverage:** audit §3.6 → Tasks 1–6 (CRUD, ROUND_ROBIN standings, COLLECTION default, deferred formats, competition top scorers, fixtures/results); §3.7 → Task 7 (a competitions entry point on the home feed). Day-grouping of the dashboard is deliberately **not** built: the audit itself says it is only worth it "when a typical org has multi-day volume", and with the current data it would add chrome for a handful of matches.
- **Deliberate deviations:** no bottom-nav item (measured layout hazard, documented above); the standings table shows five columns rather than the full eight, for phone readability; points are fixed at 3/1/0 with the engine accepting overrides for later.
- **Type consistency:** `StandingsRow` (engine, no names) is widened to `StandingsEntry` (API, with `teamName`) — deliberately two types, since the engine must stay free of database concerns. `computeStandings` returns rows already sorted, so no caller re-sorts.
- **Known risk:** standings and top scorers each call `reduceMatch` per completed match on every request. That is O(matches × events) with no caching, matching how `teamStatsCore` already behaves. Fine at grassroots scale; if a competition ever holds hundreds of matches this is the first thing to cache, keyed on `MatchStats.version`.
