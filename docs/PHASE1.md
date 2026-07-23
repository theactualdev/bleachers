# Phase 1 (MVP) — Status

**Complete and verified.** Football-only, match-first, event-sourced, offline-capable.

## What's built

| Deliverable       | Status | Where                                                             |
| ----------------- | ------ | ----------------------------------------------------------------- |
| Authentication    | ✅     | Better Auth (magic link + Google) mounted in the API              |
| Football          | ✅     | `packages/sport-engine` — `football.ts` config (basic + advanced) |
| Match creation    | ✅     | `apps/web/.../matches/new` — 3-step <30s flow                     |
| Teams             | ✅     | API `teams` module + web pages, rosters                           |
| Players           | ✅     | API `players` module + web pages, career profile                  |
| Live scoring      | ✅     | `apps/web/.../matches/[id]/live` — two-tap, config-driven buttons |
| Undo              | ✅     | `POST /matches/:id/events/undo` (voids last, lossless)            |
| Offline support   | ✅     | IndexedDB queue + optimistic overlay + background sync            |
| Event sourcing    | ✅     | append-only `Event`, void + replacement, derived stats            |
| Career stats      | ✅     | `GET /players/:id/career` — folded from the event stream          |
| Public match page | ✅     | `/m/[id]` (web) + `GET /api/public/matches/:id` + CSV export      |

## API surface (Phase 1)

```
GET    /health
*      /api/auth/*                     Better Auth (magic link, Google, session)
GET    /api/me                         Current user
GET    /api/sports                     Supported sports
GET    /api/sports/:sport/config       Sport configuration (drives the UI)

GET    /api/players                    List / GET :id / POST / PATCH :id
GET    /api/players/:id/career         Derived career stats

GET    /api/teams                      List / GET :id / POST / PATCH :id
GET    /api/teams/:id/roster           GET / POST / DELETE :playerId
GET    /api/teams/:id/stats            Derived WDL + form

GET    /api/matches                    List / GET :id / POST / PATCH :id
GET    /api/matches/:id/stats          Derived match stats (score, timeline, players)
GET    /api/matches/:id/events         Event stream
POST   /api/matches/:id/events         Record an event (idempotent on client id)
POST   /api/matches/:id/events/undo    Undo last event (void)
POST   /api/matches/:id/events/:eid/void  Void + optional replacement
POST   /api/sync/events                Batch upload (offline sync, idempotent)

GET    /api/public/matches/:id             Public read-only match
GET    /api/public/matches/:id/export.csv  CSV export
GET    /api/public/players/:id             Public player profile

WS     match:join / match:leave        Realtime; server emits event:new / event:void
```

## Verification performed

- **Engine unit tests** — 21 passing (`pnpm --filter @bleachers/sport-engine test`):
  scoring, own goals, voiding, timeline running score, period breakdown, tier gating,
  derived stats, career aggregation, team WDL/form, safe expression evaluator.
- **Types tests** — 3 passing (schema refinements/defaults).
- **API integration tests** — 6 passing against real Postgres
  (`pnpm --filter @bleachers/api test`): record → derive score, idempotent replay, undo
  (void without delete), batch upload with duplicate detection, tier rejection, career totals.
- **Live HTTP smoke** — verified end to end with the running stack: magic-link sign-in,
  guard returns 401 unauthenticated, create teams/players/match, record goal+assist,
  undo voids the assist, batch replay reports 1 accepted + 1 duplicate, final score 1–1,
  career totals correct.
- **Web** — typechecks clean, production build succeeds (12 routes), Playwright E2E for the
  public match page and auth redirect.

## Extensibility check

Adding a sport is a config file only: create `packages/sport-engine/src/config/<sport>.ts`
and register it in `registry.ts`. No engine, API, or UI code changes — the scoring buttons,
chained prompts, scoring rules, periods, and derived stats all come from the `SportConfig`.
Phase 2 (Basketball, Volleyball) is exactly this exercise.
