# Bleachers 🏟️

Mobile-first Progressive Web App for recording **live statistics in grassroots sports**.
Match-first, offline-capable, event-sourced. Create a match in seconds, score it live from
your phone, and accumulate player career stats automatically.

Supported sports (via configuration, no code): **Football**, **Basketball**, **Volleyball**.

## Why it's built this way

- **Match-first, not league-first.** Matches exist independently; competitions are an optional
  layer on top.
- **Event sourcing.** Every action is an immutable `Event`. Corrections _void_ events and append
  replacements — nothing is ever mutated or deleted. **All statistics are derived**, never stored.
- **One configurable scoring engine.** Each sport is a JSON config (periods, event types, scoring
  rules, derived stats, button layout, clock behaviour). Adding a sport = adding a config file.
- **Offline-first.** IndexedDB event queue, optimistic UI, UUID idempotency keys, background sync.

## Monorepo layout

```
apps/
  api/            NestJS + Prisma + Postgres — event-sourced REST API, WebSockets, Supabase Auth
  web/            Next.js (App Router) PWA — dashboard, live scoring, offline, public pages
packages/
  types/          Shared domain types + Zod schemas (contract source of truth)
  sport-engine/   Framework-free configurable scoring/stats engine + sport configs
  ui/             Shared shadcn/ui components
  config/         Shared tsconfig / eslint / prettier presets
docs/             Architecture decision records & assumptions
```

## Quick start

1. `pnpm install`
2. Create a Supabase project and populate `apps/api/.env` and `apps/web/.env` (see `.env.example` and `apps/web/.env.example`).
3. `pnpm db:migrate` — apply schema to Supabase
4. `pnpm db:seed` — demo teams, players, a live match (owned by the seed user)
5. `pnpm dev` — api on :4000, web on :3000

Sign in at http://localhost:3000 with a magic link (emailed via the SMTP you configured in Supabase). `docker-compose.yml` remains as an optional local-Postgres fallback (`pnpm db:up`).

## Common scripts

| Command           | What it does                                  |
| ----------------- | --------------------------------------------- |
| `pnpm dev`        | Run api + web in watch mode (Turborepo)       |
| `pnpm build`      | Build all packages and apps                   |
| `pnpm test`       | Unit + integration tests across the workspace |
| `pnpm test:e2e`   | Playwright end-to-end tests                   |
| `pnpm lint`       | ESLint across the workspace                   |
| `pnpm typecheck`  | `tsc --noEmit` across the workspace           |
| `pnpm db:migrate` | Apply Prisma migrations                       |

## Roadmap

- **Phase 1 (MVP, in progress):** Auth, Football, teams, players, match creation, live scoring,
  undo, offline, event sourcing, career stats, public match page.
- **Phase 2:** Basketball, Volleyball, full sport-configuration engine.
- **Phase 3:** Competitions, standings, brackets, leaderboards.
- **Phase 4:** Advanced analytics, notifications, rich sharing, performance.

See [`docs/`](./docs) for architecture decision records and [`docs/ASSUMPTIONS.md`](./docs/ASSUMPTIONS.md).
