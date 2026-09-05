# Phase B: Consumption Surfaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the match, team and player data the engine already computes but no pixel renders — team comparison bars, period scores, lineups, a club page with form and results, and a player match log.

**Architecture:** Almost no new computation. `MatchStats.teamStats`, `MatchStats.scoreByPeriod` and the entire `TeamStats` type (including its W/D/L `form` array) are computed and served today and rendered by nothing. This phase is mostly new React components reading existing payloads, plus two small API additions: a `teamId` filter on the matches list, and one genuinely new endpoint for the player match log.

**Tech Stack:** NestJS + Prisma (API), Next.js 15 App Router + TanStack Query (web), Zod (`@bleachers/types`), Vitest (unit), Playwright (e2e).

**Source spec:** `docs/audits/sofascore-blend-audit.md` §3.3, §3.4, §3.5. Phase A (§3.0–3.2) is merged and deployed; this builds on it.

## Global Constraints

- Monorepo commands run from repo root with `pnpm --filter <pkg>`; packages are `@bleachers/types`, `@bleachers/sport-engine`, `@bleachers/api`, `@bleachers/web`.
- CI order is `format:check → lint → typecheck → prisma:deploy → test → build`; run `pnpm format:check` from the repo root BEFORE every commit and check its exit code directly — do not pipe it through `| tail`, which swallows the failure.
- Commit messages: no `Co-Authored-By` trailer, no generated-with footer.
- Do NOT run `git push`. Commit only; the orchestrator pushes after verifying the full gate.
- The only database is the production Supabase project. Test new logic as pure functions where possible; do not add DB-backed tests.
- **No migration in this phase.** Nothing here changes the schema.
- Do not modify `apps/web/public/`, `apps/web/src/app/sw.js/route.ts`, or `railway.json`.
- Do not run `deno` inside the repo — it rewrites the root `package.json`.

## Verified facts this plan is built on

Established by reading the code; trust these over intuition.

- `StatValue` = `{ key: string; label: string; value: number; format: 'int' | 'percent' | 'decimal' }` (`packages/types/src/stats.ts:10-18`).
- `MatchStats` carries `score`, `scoreByPeriod: [number, number][]`, `timeline`, `players`, `teamStats: { HOME: StatValue[]; AWAY: StatValue[] }`, `version`. **`scoreByPeriod`, `teamStats` and `version` are rendered nowhere** — `grep -rn "teamStats\|scoreByPeriod" apps/web/src` returns nothing.
- `TeamStats` = `{ teamId, played, won, drawn, lost, goalsFor, goalsAgainst, form: ('W'|'D'|'L')[] }` (`packages/types/src/stats.ts:70-82`), served by `GET /api/teams/:id/stats`, consumed by **no web hook**. `form` is most-recent-first. Only `COMPLETED` matches are counted (`apps/api/src/statistics/statistics.service.ts:76-100`), so `played` will legitimately differ from the length of a fixtures list.
- `MatchDetail` (what `useMatch` returns) = `Match & { homeTeam: Team; awayTeam: Team } & { lineups: MatchLineup[] }` (`apps/web/src/lib/hooks.ts:24-25`). **Lineups are already on the authed page**, unused.
- `MatchLineup` = `{ id, matchId, side, playerId, isStarter, jerseyNumberOverride, createdAt }` — **no player name**. Names come from the org-wide `usePlayers()` list via a local `nameOf` closure.
- The authed match page's section container is `<div className="space-y-4 px-4 py-2">`, so inserted sections need no margins. Section chrome is `<Card><CardContent className="pt-5"><h2 className="text-eyebrow text-ink-3 mb-3">`.
- **The public page does not share the `Scoreboard` component** and imports no shared components — it hand-rolls its markup (`apps/web/src/app/m/[id]/page.tsx`). Do not assume shared UI between the two match surfaces.
- **No Tabs/segmented component exists** anywhere in `apps/web/src/components`. Do not invent one for this phase; use stacked sections.
- `GET /api/matches` takes **no query parameters** (`matches.controller.ts:20-23`); `Query` is not even imported.
- `Event` has `@@index([playerId])` and nullable `playerId`; `MatchLineup` is the only record of which side a player was on.
- Existing UI to reuse: `Card`/`CardContent`, `StatGrid`, `Avatar`, `Badge`, `LiveDot`, `Skeleton`, `EmptyState`, `QueryErrorState`, `Button`, `PageHeader`. There is no shared `Section` heading component (the dashboard defines a local one).

---

### Task 1: Team comparison bars + period score line

**Files:**

- Create: `apps/web/src/components/stat-comparison.tsx`
- Create: `apps/web/src/components/stat-comparison.test.tsx`
- Modify: `apps/web/src/app/matches/[id]/page.tsx`

**Interfaces:**

- Consumes: `StatValue` from `@bleachers/types`; `stats.teamStats` and `stats.scoreByPeriod` from `useMatchStats`.
- Produces:
  - `pairStats(home: StatValue[], away: StatValue[]): Array<{ key: string; label: string; home: number; away: number; format: StatValue['format'] }>` — exported for testing
  - `<StatComparison home={StatValue[]} away={StatValue[]} homeColor={string} awayColor={string} />`
  - `<PeriodScores scores={[number, number][]} periodLabel={string} />`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/stat-comparison.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { pairStats } from './stat-comparison';

const sv = (key: string, value: number, label = key) => ({
  key,
  label,
  value,
  format: 'int' as const,
});

describe('pairStats', () => {
  it('pairs matching keys from both sides', () => {
    const rows = pairStats([sv('shots', 7)], [sv('shots', 3)]);
    expect(rows).toEqual([{ key: 'shots', label: 'shots', home: 7, away: 3, format: 'int' }]);
  });

  it('keeps a stat present on only one side, zero-filling the other', () => {
    const rows = pairStats([sv('corners', 4)], []);
    expect(rows).toEqual([{ key: 'corners', label: 'corners', home: 4, away: 0, format: 'int' }]);
  });

  it('drops rows where neither side did anything', () => {
    expect(pairStats([sv('fouls', 0)], [sv('fouls', 0)])).toEqual([]);
  });

  it('preserves home ordering, then appends away-only keys', () => {
    const rows = pairStats([sv('a', 1), sv('b', 2)], [sv('b', 1), sv('c', 5)]);
    expect(rows.map((r) => r.key)).toEqual(['a', 'b', 'c']);
  });

  it('prefers whichever side supplies a label', () => {
    const rows = pairStats(
      [{ key: 'x', label: '', value: 0, format: 'int' }],
      [sv('x', 2, 'Shots')],
    );
    expect(rows[0].label).toBe('Shots');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @bleachers/web exec vitest run src/components/stat-comparison.test.tsx`
Expected: FAIL — cannot resolve `./stat-comparison`.

- [ ] **Step 3: Implement**

Create `apps/web/src/components/stat-comparison.tsx`:

```tsx
'use client';

import type { StatValue } from '@bleachers/types';

export interface ComparisonRow {
  key: string;
  label: string;
  home: number;
  away: number;
  format: StatValue['format'];
}

/**
 * Zip the two per-side stat arrays into comparison rows.
 *
 * The sides are independent arrays that need not share keys or order, so this
 * unions them: home ordering first (it is the more familiar reading order),
 * then any away-only keys. Rows where both sides are zero are dropped —
 * a wall of "0 vs 0" is noise, not information.
 */
export function pairStats(home: StatValue[], away: StatValue[]): ComparisonRow[] {
  const awayByKey = new Map(away.map((s) => [s.key, s]));
  const seen = new Set<string>();
  const rows: ComparisonRow[] = [];

  for (const h of home) {
    seen.add(h.key);
    const a = awayByKey.get(h.key);
    rows.push({
      key: h.key,
      label: h.label || a?.label || h.key,
      home: h.value,
      away: a?.value ?? 0,
      format: h.format,
    });
  }
  for (const a of away) {
    if (seen.has(a.key)) continue;
    rows.push({ key: a.key, label: a.label || a.key, home: 0, away: a.value, format: a.format });
  }
  return rows.filter((r) => r.home !== 0 || r.away !== 0);
}

function display(value: number, format: StatValue['format']): string {
  if (format === 'percent') return `${Math.round(value)}%`;
  if (format === 'decimal') return value.toFixed(1);
  return String(value);
}

/** Centred two-sided bars, the classic match-stats comparison. */
export function StatComparison({
  home,
  away,
  homeColor,
  awayColor,
}: {
  home: StatValue[];
  away: StatValue[];
  homeColor: string;
  awayColor: string;
}) {
  const rows = pairStats(home, away);
  if (rows.length === 0) return null;

  return (
    <div className="space-y-3">
      {rows.map((r) => {
        const total = r.home + r.away;
        // A 50/50 split for an all-zero total never renders (filtered above);
        // this guard is for a total that is zero only after rounding.
        const homePct = total > 0 ? (r.home / total) * 100 : 50;
        return (
          <div key={r.key}>
            <div className="text-ink-2 mb-1 flex items-baseline justify-between text-xs">
              <span className="tabnums text-ink-1 font-semibold">{display(r.home, r.format)}</span>
              <span className="text-eyebrow text-ink-3">{r.label}</span>
              <span className="tabnums text-ink-1 font-semibold">{display(r.away, r.format)}</span>
            </div>
            <div className="bg-glass flex h-1.5 overflow-hidden rounded-full">
              <div style={{ width: `${homePct}%`, backgroundColor: homeColor }} />
              <div style={{ width: `${100 - homePct}%`, backgroundColor: awayColor }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Per-period scoreline, e.g. "Half 1 1–0 · Half 2 1–1". */
export function PeriodScores({
  scores,
  periodLabel,
}: {
  scores: [number, number][];
  periodLabel: string;
}) {
  if (scores.length < 2) return null;
  return (
    <p className="text-ink-3 tabnums text-center text-xs">
      {scores.map(([h, a], i) => (
        <span key={i}>
          {i > 0 && <span className="mx-1.5">·</span>}
          {periodLabel} {i + 1}{' '}
          <span className="text-ink-2 font-medium">
            {h}–{a}
          </span>
        </span>
      ))}
    </p>
  );
}
```

- [ ] **Step 4: Wire both into the authed match page**

In `apps/web/src/app/matches/[id]/page.tsx`, add to imports:

```tsx
import { PeriodScores, StatComparison } from '@/components/stat-comparison';
```

Directly after the `</Scoreboard>` element (before the `<div className="flex gap-2">` action row), insert:

```tsx
{
  stats && stats.scoreByPeriod.length > 1 && (
    <PeriodScores scores={stats.scoreByPeriod} periodLabel={config.periods.periodLabel} />
  );
}
```

After the Player-stats `<Card>` (the last section, before the closing `</div>`), insert:

```tsx
{
  stats && (
    <Card>
      <CardContent className="pt-5">
        <h2 className="text-eyebrow text-ink-3 mb-4">Match stats</h2>
        <StatComparison
          home={stats.teamStats.HOME}
          away={stats.teamStats.AWAY}
          homeColor={homeColor}
          awayColor={awayColor}
        />
      </CardContent>
    </Card>
  );
}
```

`StatComparison` returns `null` when there is nothing to show, so the card renders empty-headed only if every stat is zero — acceptable for v1 and simpler than duplicating the emptiness check.

- [ ] **Step 5: Verify and commit**

```bash
pnpm --filter @bleachers/web exec vitest run src/components/stat-comparison.test.tsx
pnpm --filter @bleachers/web typecheck
pnpm --filter @bleachers/web lint
pnpm format:check
```

All must pass (`format:check` exit 0). Then:

```bash
git add apps/web/src/components/stat-comparison.tsx apps/web/src/components/stat-comparison.test.tsx "apps/web/src/app/matches/[id]/page.tsx"
git commit -m "feat(web): render the team comparison and period scores

MatchStats has carried teamStats and scoreByPeriod since the engine was
written and no pixel has ever rendered either. Both now appear on the
match page: centred two-sided bars per stat, and a per-period scoreline
under the score."
```

---

### Task 2: Lineups on the authed match page

**Files:**

- Create: `apps/web/src/components/lineups.tsx`
- Modify: `apps/web/src/app/matches/[id]/page.tsx`

**Interfaces:**

- Consumes: `MatchLineup` from `@bleachers/types`; the `nameOf` closure already defined on the match page.
- Produces: `<Lineups lineups={MatchLineup[]} homeName={string} awayName={string} nameOf={(id: string) => string} />`

- [ ] **Step 1: Implement the component**

Create `apps/web/src/components/lineups.tsx`:

```tsx
'use client';

import type { MatchLineup } from '@bleachers/types';

/**
 * Two team sheets side by side. Deliberately a list, not a pitch: formations
 * are not modelled anywhere in this codebase, and inventing positions here
 * would be fiction. Starters first, then substitutes.
 *
 * `MatchLineup` carries no player name — only `playerId` — so the caller
 * passes the same `nameOf` resolver the rest of the page uses.
 */
function Side({
  title,
  rows,
  nameOf,
}: {
  title: string;
  rows: MatchLineup[];
  nameOf: (id: string) => string;
}) {
  const starters = rows.filter((r) => r.isStarter);
  const subs = rows.filter((r) => !r.isStarter);

  return (
    <div className="min-w-0">
      <p className="text-ink-1 mb-2 truncate text-sm font-semibold">{title}</p>
      {rows.length === 0 ? (
        <p className="text-ink-3 text-xs">No lineup recorded</p>
      ) : (
        <ul className="space-y-1.5">
          {starters.map((r) => (
            <li key={r.id} className="text-ink-2 flex items-baseline gap-2 text-sm">
              <span className="text-ink-3 tabnums w-6 shrink-0 text-xs">
                {r.jerseyNumberOverride ?? ''}
              </span>
              <span className="truncate">{nameOf(r.playerId)}</span>
            </li>
          ))}
          {subs.length > 0 && (
            <>
              <li className="text-eyebrow text-ink-3 pt-2">Substitutes</li>
              {subs.map((r) => (
                <li key={r.id} className="text-ink-3 flex items-baseline gap-2 text-sm">
                  <span className="tabnums w-6 shrink-0 text-xs">
                    {r.jerseyNumberOverride ?? ''}
                  </span>
                  <span className="truncate">{nameOf(r.playerId)}</span>
                </li>
              ))}
            </>
          )}
        </ul>
      )}
    </div>
  );
}

export function Lineups({
  lineups,
  homeName,
  awayName,
  nameOf,
}: {
  lineups: MatchLineup[];
  homeName: string;
  awayName: string;
  nameOf: (id: string) => string;
}) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <Side title={homeName} rows={lineups.filter((l) => l.side === 'HOME')} nameOf={nameOf} />
      <Side title={awayName} rows={lineups.filter((l) => l.side === 'AWAY')} nameOf={nameOf} />
    </div>
  );
}
```

- [ ] **Step 2: Wire it into the match page**

Add to imports in `apps/web/src/app/matches/[id]/page.tsx`:

```tsx
import { Lineups } from '@/components/lineups';
```

Insert directly before the Timeline `<Card>`:

```tsx
{
  match.lineups.length > 0 && (
    <Card>
      <CardContent className="pt-5">
        <h2 className="text-eyebrow text-ink-3 mb-4">Lineups</h2>
        <Lineups
          lineups={match.lineups}
          homeName={match.homeTeam.name}
          awayName={match.awayTeam.name}
          nameOf={(pid) => nameOf(pid)}
        />
      </CardContent>
    </Card>
  );
}
```

`nameOf` on this page is typed `(pid: string | null) => string`, so the arrow adapts it to the component's `(id: string) => string`.

- [ ] **Step 3: Verify and commit**

```bash
pnpm --filter @bleachers/web typecheck && pnpm --filter @bleachers/web lint && pnpm format:check
pnpm --filter @bleachers/web build
```

```bash
git add apps/web/src/components/lineups.tsx "apps/web/src/app/matches/[id]/page.tsx"
git commit -m "feat(web): show lineups on the match page

match.lineups has been fetched with every match and rendered nowhere. Two
team sheets, starters then substitutes, shirt numbers where recorded.
A list rather than a pitch: formations are not modelled in this codebase
and drawing positions we do not have would be invention."
```

---

### Task 3: The same three sections on the public page

**Files:**

- Modify: `apps/api/src/sharing/sharing.service.ts`
- Modify: `apps/web/src/app/m/[id]/page.tsx`

**Interfaces:**

- Consumes: `Lineups`, `StatComparison`, `PeriodScores` from Tasks 1–2.
- Produces: `GET /api/public/matches/:id` additionally returns `lineups: Array<{ id, side, playerId, isStarter, jerseyNumberOverride }>`.

- [ ] **Step 1: Add lineups to the public payload**

`publicMatch` already queries `lineups: { include: { player: true } }` and builds `playerNames` from them — the data is loaded and thrown away. In `apps/api/src/sharing/sharing.service.ts`, add to the returned object (as a sibling of `playerNames`):

```ts
      // Already loaded for playerNames above; returning the rows lets the public
      // page render team sheets without a second request.
      lineups: match.lineups.map((l) => ({
        id: l.id,
        side: l.side,
        playerId: l.playerId,
        isStarter: l.isStarter,
        jerseyNumberOverride: l.jerseyNumberOverride,
      })),
```

- [ ] **Step 2: Render them on the public page**

In `apps/web/src/app/m/[id]/page.tsx`, extend the `PublicMatch` interface with:

```ts
lineups: {
  id: string;
  side: 'HOME' | 'AWAY';
  playerId: string;
  isStarter: boolean;
  jerseyNumberOverride: string | null;
}
[];
```

Add imports:

```tsx
import { PeriodScores, StatComparison } from '@/components/stat-comparison';
```

The public page's own section chrome is `<section className="glass rim mt-4 rounded-xl p-5">` with `<h2 className="text-eyebrow text-ink-3 mb-3">` — match it, do NOT import `Card` (this page deliberately shares no component chrome with the authed app).

Immediately after the score card `</div>` and before the Timeline `<section>`, add the period line:

```tsx
{
  stats.scoreByPeriod.length > 1 && (
    <div className="mt-3">
      <PeriodScores scores={stats.scoreByPeriod} periodLabel={config.periods.periodLabel} />
    </div>
  );
}
```

After the Timeline `</section>`, add lineups and comparison:

```tsx
{
  data.lineups.length > 0 && (
    <section className="glass rim mt-4 rounded-xl p-5">
      <h2 className="text-eyebrow text-ink-3 mb-3">Lineups</h2>
      <div className="grid grid-cols-2 gap-4">
        {(['HOME', 'AWAY'] as const).map((side) => (
          <div key={side} className="min-w-0">
            <p className="text-ink-1 mb-2 truncate text-sm font-semibold">
              {side === 'HOME' ? homeTeam.name : awayTeam.name}
            </p>
            <ul className="space-y-1.5">
              {data.lineups
                .filter((l) => l.side === side)
                .sort((a, b) => Number(b.isStarter) - Number(a.isStarter))
                .map((l) => (
                  <li
                    key={l.id}
                    className={`flex items-baseline gap-2 text-sm ${l.isStarter ? 'text-ink-2' : 'text-ink-3'}`}
                  >
                    <span className="tabnums text-ink-3 w-6 shrink-0 text-xs">
                      {l.jerseyNumberOverride ?? ''}
                    </span>
                    <span className="truncate">{playerNames[l.playerId] ?? 'Player'}</span>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

<section className="glass rim mt-4 rounded-xl p-5">
  <h2 className="text-eyebrow text-ink-3 mb-3">Match stats</h2>
  <StatComparison
    home={stats.teamStats.HOME}
    away={stats.teamStats.AWAY}
    homeColor={homeTeam.colors.primary}
    awayColor={awayTeam.colors.primary}
  />
</section>;
```

The public page re-implements the lineup list rather than importing `Lineups` because its name resolution is a plain `playerNames` record, not a `nameOf` closure, and its row chrome differs. Duplication is deliberate and small; do not refactor the two into one component in this task.

- [ ] **Step 3: Verify and commit**

```bash
pnpm typecheck && pnpm --filter @bleachers/web lint && pnpm format:check
pnpm --filter @bleachers/web build
pnpm --filter @bleachers/api build
```

```bash
git add apps/api/src/sharing/sharing.service.ts "apps/web/src/app/m/[id]/page.tsx"
git commit -m "feat(public): lineups, match stats and period scores on the shared page

The public payload already loaded lineup rows to build its player-name map
and then discarded them; it now returns them. The shared link gains the
same three sections the authed page just got, in its own chrome — this
page shares no components with the app by design."
```

---

### Task 4: `teamId` filter on the matches list

**Files:**

- Modify: `apps/api/src/matches/matches.controller.ts`
- Modify: `apps/api/src/matches/matches.service.ts`
- Modify: `apps/web/src/lib/hooks.ts`

**Interfaces:**

- Produces:
  - `GET /api/matches?teamId=<uuid>` — org-scoped as before, additionally filtered to matches where the team is home or away
  - `useTeamMatches(teamId: string)` in hooks — `queryKey: ['matches', orgId, 'team', teamId]`, returns `MatchWithTeams[]`

- [ ] **Step 1: Add the filter to the API**

In `apps/api/src/matches/matches.controller.ts`, add `Query` to the `@nestjs/common` import, and replace the `list` handler:

```ts
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @CurrentOrgId() orgId: string,
    @Query('teamId', new ParseUUIDPipe({ optional: true })) teamId?: string,
  ) {
    return this.matches.list(user.id, orgId, teamId);
  }
```

In `apps/api/src/matches/matches.service.ts`, change the `list` signature to accept the optional id and add the predicate to its `where`:

```ts
  async list(userId: string, orgId: string, teamId?: string) {
```

and inside the existing `where` object:

```ts
        ...(teamId ? { OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }] } : {}),
```

Leave everything else — ordering, includes, membership assertion — untouched.

Note for reviewers: `match` has no index on `homeTeamId`/`awayTeamId`, so this is an unindexed scan within the org partition. That is acceptable at current scale and is exactly what `statistics.service.ts:80-87` already does for team stats.

- [ ] **Step 2: Add the hook**

In `apps/web/src/lib/hooks.ts`, directly after `useMatches`:

```ts
/** Matches involving one team, for the club page. Same org scope as useMatches. */
export const useTeamMatches = (teamId: string) => {
  const orgId = useActiveOrgId();
  return useQuery({
    queryKey: ['matches', orgId, 'team', teamId],
    queryFn: () => apiGet<MatchWithTeams[]>(`/api/matches?teamId=${teamId}`),
    enabled: !!teamId && !!orgId,
  });
};
```

- [ ] **Step 3: Verify and commit**

```bash
pnpm typecheck && pnpm lint && pnpm format:check
pnpm --filter @bleachers/api exec vitest run test/serialize.spec.ts test/match-clock.spec.ts
```

```bash
git add apps/api/src/matches apps/web/src/lib/hooks.ts
git commit -m "feat(api): filter the matches list by team

GET /api/matches accepts an optional teamId and returns matches where that
team is home or away, still org-scoped. Backs the club page's results and
fixtures lists."
```

---

### Task 5: The club page

**Files:**

- Create: `apps/web/src/components/form-strip.tsx`
- Create: `apps/web/src/components/form-strip.test.tsx`
- Modify: `apps/web/src/lib/hooks.ts` (add `useTeamStats`)
- Modify: `apps/web/src/app/teams/[id]/page.tsx`

**Interfaces:**

- Consumes: `useTeamMatches` (Task 4); `TeamStats` from `@bleachers/types`.
- Produces:
  - `useTeamStats(teamId: string)` — `queryKey: ['team-stats', orgId, teamId]`, returns `TeamStats`
  - `<FormStrip form={('W'|'D'|'L')[]} />`
  - `resultOf(match, teamId, score): 'W' | 'D' | 'L'` is NOT needed — `TeamStats.form` is server-computed.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/form-strip.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { formChipClass } from './form-strip';

describe('formChipClass', () => {
  it('gives each result a distinct class', () => {
    const w = formChipClass('W');
    const d = formChipClass('D');
    const l = formChipClass('L');
    expect(new Set([w, d, l]).size).toBe(3);
  });

  it('uses the brand token for a win and negative for a loss', () => {
    expect(formChipClass('W')).toContain('brand');
    expect(formChipClass('L')).toContain('negative');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @bleachers/web exec vitest run src/components/form-strip.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

**Palette note (already verified — do not re-derive):** `tailwind.config.ts` defines `glass`, `hairline`, `brand`, `live` and `negative`. **There is no `positive` token**, and `--live` is amber in the active floodlight theme, not green — so `bg-positive`/`text-positive` would silently generate nothing. W/D/L therefore maps to **brand / neutral glass / negative**, three tokens that exist and read distinctly.

Create `apps/web/src/components/form-strip.tsx`:

```tsx
'use client';

export type FormResult = 'W' | 'D' | 'L';

/** Colour per result. Exported so the mapping is unit-testable without a DOM. */
export function formChipClass(r: FormResult): string {
  if (r === 'W') return 'bg-brand/15 text-brand border-brand/30';
  if (r === 'L') return 'bg-negative/15 text-negative border-negative/30';
  return 'bg-glass text-ink-2 border-hairline';
}

/**
 * Last results, most recent first — the shape `TeamStats.form` already arrives in.
 * Capped at five: a form strip is a glance, not a history.
 */
export function FormStrip({ form }: { form: FormResult[] }) {
  if (form.length === 0) return null;
  return (
    <div className="flex items-center gap-1">
      {form.slice(0, 5).map((r, i) => (
        <span
          key={i}
          className={`flex h-6 w-6 items-center justify-center rounded-md border text-[11px] font-bold ${formChipClass(r)}`}
        >
          {r}
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Add the stats hook**

In `apps/web/src/lib/hooks.ts`, add `TeamStats` to the `@bleachers/types` type imports, and after the roster hooks:

```ts
/** Season W/D/L, goals and form for one team. Counts COMPLETED matches only. */
export const useTeamStats = (teamId: string) => {
  const orgId = useActiveOrgId();
  return useQuery({
    queryKey: ['team-stats', orgId, teamId],
    queryFn: () => apiGet<TeamStats>(`/api/teams/${teamId}/stats`),
    enabled: !!teamId && !!orgId,
  });
};
```

- [ ] **Step 5: Build the page sections**

In `apps/web/src/app/teams/[id]/page.tsx`, add imports:

```tsx
import { useTeamMatches, useTeamStats } from '@/lib/hooks';
import { FormStrip } from '@/components/form-strip';
import { MatchCard } from '@/components/match-card';
```

(extend the existing `@/lib/hooks` import rather than adding a second one)

Inside `TeamProfile`, after the existing hooks:

```tsx
const { data: seasonStats } = useTeamStats(id);
const { data: teamMatches } = useTeamMatches(id);

// Results are finished matches; fixtures are everything still to come or in
// progress. Both newest-first, which is how a club page is read.
const results = (teamMatches ?? []).filter(
  (m) => m.status === 'COMPLETED' || m.status === 'ABANDONED',
);
const fixtures = (teamMatches ?? []).filter(
  (m) => m.status === 'SCHEDULED' || m.status === 'LIVE' || m.status === 'PAUSED',
);
```

In the JSX, directly under the team name header block, add the season summary:

```tsx
{
  seasonStats && seasonStats.played > 0 && (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-eyebrow text-ink-3">This season</p>
        <FormStrip form={seasonStats.form} />
      </div>
      <div className="grid grid-cols-4 gap-2 text-center">
        {[
          ['Played', seasonStats.played],
          ['Won', seasonStats.won],
          ['Drawn', seasonStats.drawn],
          ['Lost', seasonStats.lost],
        ].map(([label, value]) => (
          <div key={label as string}>
            <p className="font-display tabnums text-ink-1 text-xl font-bold">{value}</p>
            <p className="text-eyebrow text-ink-3">{label}</p>
          </div>
        ))}
      </div>
      <p className="text-ink-3 mt-3 text-center text-xs">
        <span className="tabnums text-ink-2">{seasonStats.goalsFor}</span> scored ·{' '}
        <span className="tabnums text-ink-2">{seasonStats.goalsAgainst}</span> conceded
      </p>
    </Card>
  );
}
```

At the very end of the sections container (after the roster list), add fixtures and results:

```tsx
{
  fixtures.length > 0 && (
    <div>
      <h2 className="text-eyebrow text-ink-3 mb-2">Fixtures</h2>
      <div className="flex flex-col gap-2.5">
        {fixtures.map((m) => (
          <MatchCard key={m.id} match={m} />
        ))}
      </div>
    </div>
  );
}

{
  results.length > 0 && (
    <div>
      <h2 className="text-eyebrow text-ink-3 mb-2">Results</h2>
      <div className="flex flex-col gap-2.5">
        {results.map((m) => (
          <MatchCard key={m.id} match={m} />
        ))}
      </div>
    </div>
  );
}
```

`MatchCard` already renders team-tinted score cards and links appropriately by status, so reuse it rather than writing a new row component. Note it calls `useMatchStats` per card — acceptable here (a club page shows a handful of matches), but do not use it for long lists later.

- [ ] **Step 6: Verify and commit**

```bash
pnpm --filter @bleachers/web exec vitest run src/components/form-strip.test.tsx
pnpm typecheck && pnpm lint && pnpm format:check
pnpm --filter @bleachers/web build
```

```bash
git add apps/web/src/components/form-strip.tsx apps/web/src/components/form-strip.test.tsx apps/web/src/lib/hooks.ts "apps/web/src/app/teams/[id]/page.tsx"
git commit -m "feat(web): the team page becomes a club page

GET /api/teams/:id/stats has been live and consumed by nothing since it was
written — it already computes played/won/drawn/lost, goals and a W/D/L form
strip. The page now renders all of it, plus fixtures and results from the
new teamId filter. Roster management stays where it was."
```

---

### Task 6: Player match log

**Files:**

- Modify: `packages/types/src/stats.ts`
- Modify: `apps/api/src/statistics/statistics.service.ts`
- Modify: `apps/api/src/statistics/statistics.controller.ts`
- Modify: `apps/web/src/lib/hooks.ts`
- Modify: `apps/web/src/app/players/[id]/page.tsx`

**Interfaces:**

- Produces:
  - `PlayerMatchLogEntrySchema` / `type PlayerMatchLogEntry` in `@bleachers/types`
  - `GET /api/players/:id/matches?sport=FOOTBALL` → `PlayerMatchLogEntry[]`, newest first
  - `usePlayerMatches(playerId: string)` — `queryKey: ['player-matches', orgId, playerId]`

- [ ] **Step 1: Add the type**

In `packages/types/src/stats.ts`, after `PlayerCareerStatsSchema`:

```ts
/** One row of a player's match log: what they did, and how the match went. */
export const PlayerMatchLogEntrySchema = z.object({
  matchId: IdSchema,
  scheduledAt: z.string().datetime({ offset: true }),
  status: z.string(),
  side: MatchSideSchema,
  opponentName: z.string(),
  /** [goalsFor, goalsAgainst] from this player's side. */
  score: z.tuple([z.number().int(), z.number().int()]),
  /** Null unless the match is COMPLETED — an unfinished match has no result. */
  result: z.enum(['W', 'D', 'L']).nullable(),
  stats: z.array(StatValueSchema),
});
export type PlayerMatchLogEntry = z.infer<typeof PlayerMatchLogEntrySchema>;
```

Confirm `MatchSideSchema` is already imported in this file; if not, add it to the existing import from `./enums.js`.

- [ ] **Step 2: Implement the service method**

In `apps/api/src/statistics/statistics.service.ts`, add after `playerCareer`:

```ts
  /**
   * Per-match log for a player. Membership is checked against the player's org,
   * exactly as playerCareer does.
   *
   * A player counts as involved if they were named in the lineup OR recorded an
   * event — a substitute who was never listed still appears through their goal.
   */
  async playerMatches(
    userId: string,
    playerId: string,
    sport: Sport = 'FOOTBALL',
  ): Promise<PlayerMatchLogEntry[]> {
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
      select: { organizationId: true },
    });
    if (!player) throw new NotFoundException('Player not found');
    await this.members.assertMember(userId, player.organizationId, 'VIEWER');

    const matches = await this.prisma.match.findMany({
      where: {
        sport,
        OR: [{ lineups: { some: { playerId } } }, { events: { some: { playerId } } }],
      },
      orderBy: { scheduledAt: 'desc' },
      include: {
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
        lineups: { where: { playerId }, select: { side: true } },
        events: { where: { voided: false } },
      },
    });

    const config = getSportConfig(sport);

    return matches.map((m) => {
      const stats = reduceMatch(config, m.id, m.events.map(toEvent), m.statTier);
      // Prefer the lineup's side; fall back to the side of this player's events.
      const side =
        m.lineups[0]?.side ?? m.events.find((e) => e.playerId === playerId)?.side ?? 'HOME';
      const isHome = side === 'HOME';
      const score: [number, number] = isHome
        ? [stats.score[0], stats.score[1]]
        : [stats.score[1], stats.score[0]];
      const result =
        m.status === 'COMPLETED'
          ? score[0] > score[1]
            ? ('W' as const)
            : score[0] < score[1]
              ? ('L' as const)
              : ('D' as const)
          : null;

      return {
        matchId: m.id,
        scheduledAt: m.scheduledAt.toISOString(),
        status: m.status,
        side,
        opponentName: isHome ? m.awayTeam.name : m.homeTeam.name,
        score,
        result,
        stats: stats.players.find((p) => p.playerId === playerId)?.stats ?? [],
      };
    });
  }
```

Ensure the file imports `PlayerMatchLogEntry` from `@bleachers/types` and that `reduceMatch`, `getSportConfig` and `toEvent` are already imported (they are, for `teamStatsCore`).

- [ ] **Step 3: Add the route**

In `apps/api/src/statistics/statistics.controller.ts`, mirroring the existing career route (which parses `sport` with `SportSchema.catch('FOOTBALL')`):

```ts
  @Get('players/:id/matches')
  playerMatches(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('sport') sport?: string,
  ) {
    return this.stats.playerMatches(user.id, id, SportSchema.catch('FOOTBALL').parse(sport));
  }
```

- [ ] **Step 4: Hook + UI**

In `apps/web/src/lib/hooks.ts`, add `PlayerMatchLogEntry` to the types import and:

```ts
/** A player's per-match log, newest first. */
export const usePlayerMatches = (playerId: string) => {
  const orgId = useActiveOrgId();
  return useQuery({
    queryKey: ['player-matches', orgId, playerId],
    queryFn: () => apiGet<PlayerMatchLogEntry[]>(`/api/players/${playerId}/matches`),
    enabled: !!playerId && !!orgId,
  });
};
```

In `apps/web/src/app/players/[id]/page.tsx`, add `usePlayerMatches` to the hooks import, `Link` from `next/link`, `Card`/`CardContent` if not present, and `StatGrid` if not present. Add the hook call beside the career one, then append this section at the end of the sections container:

```tsx
{
  matches && matches.length > 0 && (
    <Card>
      <CardContent className="pt-5">
        <h2 className="text-eyebrow text-ink-3 mb-3">Matches</h2>
        <div className="flex flex-col gap-2.5">
          {matches.map((m) => (
            <Link key={m.matchId} href={`/matches/${m.matchId}`}>
              <div className="border-hairline flex items-center gap-3 border-b pb-2.5 last:border-0">
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-bold ${
                    m.result === 'W'
                      ? 'bg-brand/15 text-brand'
                      : m.result === 'L'
                        ? 'bg-negative/15 text-negative'
                        : 'bg-glass text-ink-3'
                  }`}
                >
                  {m.result ?? '–'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-ink-1 truncate text-sm font-medium">v {m.opponentName}</p>
                  <p className="text-ink-3 text-xs">
                    {new Date(m.scheduledAt).toLocaleDateString()}
                  </p>
                </div>
                <span className="font-display tabnums text-ink-1 text-base">
                  {m.score[0]}–{m.score[1]}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
```

Uses the same brand/negative mapping established in Task 5 — there is no `positive` token.

- [ ] **Step 5: Verify and commit**

```bash
pnpm --filter @bleachers/types build
pnpm typecheck && pnpm lint && pnpm format:check
pnpm --filter @bleachers/api exec vitest run test/serialize.spec.ts test/match-clock.spec.ts test/auth-guard.spec.ts test/health.spec.ts
pnpm --filter @bleachers/web build
```

```bash
git add packages/types/src/stats.ts apps/api/src/statistics apps/web/src/lib/hooks.ts "apps/web/src/app/players/[id]/page.tsx"
git commit -m "feat(api): player match log

Career totals existed with no way to see the matches behind them. A new
endpoint folds each match the player appeared in — by lineup or by event,
so an unlisted substitute still shows up through their goal — into a row
with the opponent, the score from that player's side, and their own line."
```

---

### Task 7: Full gate

**Files:** none — verification only.

- [ ] **Step 1: Run the gate exactly as CI does**

```bash
pnpm format:check; echo "format=$?"
pnpm lint; echo "lint=$?"
pnpm typecheck; echo "typecheck=$?"
pnpm test
pnpm --filter @bleachers/web build && pnpm --filter @bleachers/api build
```

Every one must be green. `pnpm test` should report the Phase A baseline (types 3, engine 34, web 11, api 52) plus the new `stat-comparison` and `form-strip` tests.

- [ ] **Step 2: Report**

Output a summary listing: each command and its result, the new test counts, and anything you could not verify. Do not push — the orchestrator handles that.

---

## Self-review notes

- **Spec coverage:** audit §3.3 → Tasks 1–3 (lineups, comparison bars, period line, on both surfaces); §3.4 → Tasks 4–5 (results, fixtures, form, season totals); §3.5 → Task 6 (match log). "Top scorers" from §3.4 is deliberately deferred — it needs a grouped-events query that belongs with competition top scorers in Phase C, and `TeamStats` gives the page enough substance without it.
- **Deliberate deviations:** no Tabs component (none exists; stacked sections instead); the public page duplicates the lineup list rather than sharing `Lineups` (different name resolution and chrome, and that page shares no components with the app by design).
- **Type consistency:** `StatValue.format` is `'int' | 'percent' | 'decimal'` everywhere; `TeamStats.form` is `('W'|'D'|'L')[]` most-recent-first, matching `FormStrip`'s prop; `PlayerMatchLogEntry.result` is nullable because only COMPLETED matches have one.
- **Palette resolved before writing:** `tailwind.config.ts` has no `positive` token, and `--live` is amber in the active theme rather than green, so `bg-positive` would have generated nothing at all. Wins use `brand`, losses `negative`, draws neutral glass — all three verified to exist.
