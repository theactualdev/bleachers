# Assumptions & Decisions Log

Documented per the brief's instruction to "document assumptions." Updated as the build proceeds.

## Phase 1

1. **Single shared Postgres.** The NestJS API (Prisma) and Better Auth share one Postgres
   database. Better Auth's tables live alongside domain tables; this keeps sessions and users in
   one place and lets domain rows FK to `user`.
2. **Auth lives in the API.** Better Auth is framework-agnostic; we mount its handler on the
   NestJS (Express) server at `/api/auth/*`. The web app is a pure client via `better-auth/react`.
   Rationale: one source of auth truth, and the API can authorize requests directly.
3. **Cross-origin cookies in dev.** Web (`:3000`) and API (`:4000`) differ by port. We use
   `credentials: 'include'` + a CORS allowlist + `SameSite=Lax` cookies. In production both are
   served under one apex domain (or the API behind `/api`) so cookies are first-party.
4. **Magic-link email in dev.** With no SMTP configured, the API logs the magic link to the
   console instead of sending mail. Google OAuth is optional (only if client id/secret provided).
5. **Event immutability enforced in code + DB.** Events are append-only. There is no UPDATE path
   except toggling `voided`/`voidedAt`/`voidedBy` (a correction), and no DELETE path at all. A
   correction optionally appends a replacement event that references the voided one.
6. **Derived stats are never persisted.** Score, timelines, player/team/career stats are computed
   by `@bleachers/sport-engine` folding over the event stream. We may cache computed results in
   memory / HTTP cache but the event stream is the only source of truth.
7. **Idempotency.** Every event has a client-generated UUID (`id`) used as the idempotency key.
   Batch upload upserts on `id`, so replays from the offline queue are safe.
8. **Clock is informational in Phase 1.** We store `period` + `clockMs` on each event (captured
   from the scorer's device). We do not run an authoritative server clock; the match clock is a
   client concern. This is enough for football timelines and is revisited for basketball/volleyball.
9. **Ad-hoc teams & guest players.** Teams can be `isAdHoc` and players can be created inline
   during match setup to keep creation under 30 seconds. They are still first-class rows.
10. **Stat tiers.** `BASIC` vs `ADVANCED` is stored on the match and also gates which event-type
    buttons the scoring UI renders (driven by the sport config, not hardcoded).

## Deferred to later phases

- Competitions, standings, brackets (Phase 3) — the `Match.competitionId` FK and enums exist now
  so matches can be assigned later without a migration.
- Realtime is scaffolded (WS gateway broadcasting new events per match room) in Phase 1 and
  enriched later.
- Fine-grained permission scopes beyond Owner/Scorer/Viewer are modelled but only Owner/Scorer are
  enforced on write paths in Phase 1.
