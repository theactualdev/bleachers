# Product audit: Bleachers vs the Sofascore model

**Purpose.** Handover report for implementation. It maps how Sofascore's features
blend into each other, measures Bleachers against that model, and specifies what
to build, in what order, with pointers into this codebase. It builds on the
earlier logic audit (match completion, clock integrity, launch funnel) — two of
those findings gate items here and are marked as prerequisites.

**Framing.** Sofascore is a _consumption_ product for professional sport;
Bleachers is today a _recording_ product for grassroots sport. The gap is not a
list of missing features — it is that Bleachers has almost no consumption side,
while its data model and stats engine already compute most of what a
consumption side needs. The theme throughout: **surface what already exists,
then connect it.**

---

## 1. What actually makes Sofascore work

Strip the pro-data features away and Sofascore's core is one loop:

```
Home (today's matches, grouped)
  → Match (score · timeline · stats · lineups)
    → Player (season totals · recent-match log)        ← every name is a link
    → Team (form · results · fixtures · squad · top scorers)
      → Competition (standings · fixtures by round · top scorers)
        → Match …                                       ← and back around
```

Three properties give it its feel:

1. **Every entity name, everywhere, is a link.** A goalscorer in a timeline, a
   team in a header, a competition label on a card — all navigation. No screen
   is a dead end.
2. **Live is the default state, for viewers.** Scores move on their own on
   every surface — home feed, match page, shared links — not just for whoever
   is recording.
3. **Aggregates give context to atoms.** A match sits inside a competition
   table; a goal sits inside a season tally; a result updates a form strip
   (W-D-L-W-W). Each event you witness visibly moves a larger number.

Bleachers currently has none of the three, and — this is the encouraging part —
is one short layer away from each.

---

## 2. Current state (verified against the code)

What the engine and API already produce:

- `MatchStats` (`packages/types/src/stats.ts:44`) carries `score`,
  `scoreByPeriod`, a full `timeline` with per-event `scoreAfter` running score,
  per-player stat lines, and `teamStats.HOME/AWAY` arrays. This is
  Sofascore-shaped data, computed today.
- Career totals per player exist (`statistics.service.ts: playerCareer`).
- A team-stats endpoint exists: `GET /api/teams/:id/stats`.
- A realtime gateway broadcasts every recorded event and void
  (`apps/api/src/realtime/realtime.gateway.ts`, `match:join` / `match:leave`).
- A `Competition` model exists in the schema with formats KNOCKOUT,
  ROUND_ROBIN, GROUPS, LADDER, COLLECTION, and `Match.competitionId`
  (`apps/api/prisma/schema.prisma:144`).

What consumes them:

- **Cross-linking: almost none.** The only player links in the app are on the
  players index; the only team links on the teams index. Timeline rows, lineup
  names, player-stat tables, match-card team names — plain text everywhere.
- **Websocket: nothing.** `grep -rn "socket|match:join" apps/web/src` returns
  zero hits. The whole realtime layer has no client.
- **`/api/teams/:id/stats`: nothing.** No web hook references it.
- **`Competition`: nothing.** No API controller beyond pass-through on match
  create/update, no UI anywhere.
- **Public match page `/m/[id]`: static.** No `refetchInterval`, no socket. A
  shared "watch my kid's match" link renders once and never updates.
- **Team detail page**: roster management only — no results, no fixtures, no
  form, no stats.
- **Player detail page**: career totals only — no per-match log.
- **Match detail page**: timeline + player stats, but no lineups section, no
  team-comparison bars, no period-score breakdown (all three computed already).

Prerequisites carried over from the logic audit (both gate this report):

- **P1 — Matches can never end.** No UI calls `setStatus`
  (`matches.service.ts:147`); everything stays LIVE forever. Results, form,
  standings, and "finished" states all depend on this.
- **P2 — The clock is client `useState`** (`matches/[id]/live/page.tsx:36`):
  reload/lock resets it, so timeline minutes are unreliable. Every
  consumption surface displays those minutes.

---

## 3. Gap analysis and build spec

Ordered for implementation. Each item: the Sofascore pattern → the grassroots
translation → concrete work.

### 3.0 Prerequisites (from the logic audit — do first)

1. **End-match flow.** Full-time button on the live screen (with confirm),
   `COMPLETED` on the match; allow `ABANDONED` from a secondary menu. Add a
   status guard to interactive event recording (LIVE/PAUSED only) while
   leaving `POST /api/sync/events` exempt — offline queues legitimately land
   after full time.
2. **Reload-proof clock.** Persist kickoff/pause state (match row is the right
   home: `periodStartedAt`, `pausedElapsedMs`, `currentPeriod`) and derive
   elapsed time from timestamps, never from tick counting. This also fixes
   background-tab throttling drift, and makes the clock shareable state that
   public surfaces can render.

### 3.1 The cross-link pass (small, transformative)

Make every entity name a navigation, exactly as Sofascore does:

- Timeline rows (`matches/[id]/page.tsx` and `/m/[id]`): player name →
  `/players/:id`.
- Player-stats tables on match pages: name → `/players/:id`.
- Match cards and match headers: team name/badge → `/teams/:id`.
- Roster rows on the team page already link nowhere → `/players/:id`.
- Lineup pickers stay non-navigational (they are selection controls).

Public pages link within public space only (`/o/:slug`-scoped pages), never
into the authed app. One session of work; changes how the whole app feels.

### 3.2 Live for viewers (the realtime layer earns its keep)

- **Public match page**: connect to the existing gateway (or, simpler first
  step, `refetchInterval: 10_000` on the stats query while `status === LIVE`,
  stopping on COMPLETED). Socket preferred — the server already broadcasts.
- **Authed match detail + dashboard**: same treatment; the "Live now" section
  should tick without a manual refresh.
- Show the derived clock (from P2) on all three surfaces so a viewer sees a
  running minute, not a frozen one.

### 3.3 Match page parity (surface what's computed)

Sofascore match page = header, timeline, stats, lineups. Bleachers has two of
four rendered:

- **Lineups section** on match detail + public page from `match.lineups`
  (names, shirt numbers via `jerseyNumberOverride`). No pitch/formations —
  a list per side is the grassroots-honest v1; formations remain a separately
  scoped feature.
- **Team comparison bars** from `teamStats.HOME/AWAY` (shots, cards, etc. —
  whatever `StatValue`s the tier produced). Classic centred-bar layout.
- **Period score line** from `scoreByPeriod` under the main score
  (e.g. `HT 1–0 · FT 2–1`). Requires P1 for "FT" to mean anything.

### 3.4 Team page (from admin surface to club page)

Translation of Sofascore's team tab, all derivable today:

- **Results + fixtures**: matches involving the team, split by status.
  Needs a `GET /api/matches?teamId=` filter (currently org-wide list only).
- **Form strip**: last five completed results as W/D/L chips (P1-dependent).
- **Season totals + top scorers**: wire the orphaned `GET /api/teams/:id/stats`
  into the page; add a small "top scorers" list derived from events grouped by
  player.
- Existing roster block stays; this page becomes tabbed (Squad · Results ·
  Stats) once it holds three sections.

### 3.5 Player page (add the match log)

Career totals exist; add what Sofascore calls the recent-match list: per-match
rows (opponent, date, result, this player's contributions — goals/cards/etc.)
derived from events + lineups by `matchId`. New endpoint
`GET /api/players/:id/matches`; render newest-first under the career block.

### 3.6 Competitions v1 (the aggregation spine)

The schema is ready; build the thinnest real version:

- CRUD endpoints + org-scoped list; attach/detach matches (the
  `competitionId` PATCH already exists).
- **ROUND_ROBIN first**: standings computed from COMPLETED matches (P, W, D,
  L, GF, GA, GD, Pts) — a pure fold over match results, same event-sourced
  philosophy as the stats engine. Ship table + fixtures/results lists +
  competition top scorers.
- COLLECTION as the no-table default bucket ("Friendlies").
- KNOCKOUT / GROUPS / LADDER: defer; render their matches as a COLLECTION
  until each format's bracket/table logic is actually designed.
- Home cards and match headers then carry a competition label → competition
  page, closing Sofascore's loop.

### 3.7 Home feed (last)

Group the dashboard by day (Today / Tomorrow / date headers) and, once 3.6
lands, by competition within a day. A Sofascore-style date strip is worth it
only when a typical org has multi-day volume; don't build it before then.

---

## 4. Explicit non-goals

Pro-data features that do not translate to grassroots recording and must not
be attempted: player ratings, heatmaps, attack-momentum graphs, xG,
head-to-head archives, odds/betting content, comments/social, push
notifications and favorites (single-org membership makes "following" moot for
now — revisit if public org profiles grow an audience), and native apps (the
PWA is the strategy).

## 5. Verification notes for the implementer

- Playwright e2e lives in `apps/web/tests-e2e`; `auth.setup.ts` hardcodes
  origin `http://localhost:3000` — mirror the origin in
  `tests-e2e/.auth/user.json` if running the app on another port, and note
  port 3000 may be occupied by an unrelated dev server.
- CI (and today's only database) point at the production Supabase — the logic
  audit's environment-separation item. Standings math and end-match flows
  should get engine-level unit tests (`packages/sport-engine`) rather than
  more DB-backed integration tests.
- The stats engine's `version` field is the cache key for polling surfaces —
  cheap change detection for 3.2 without diffing payloads.
- After any template or public-surface change, re-verify with the delivered
  artifact (Resend/`curl`), not just the source — this project has been bitten
  by "fixed in repo, stale in production" twice (email templates, Supabase
  edge function).

## 6. Suggested order and sizing

| #   | Work                                                 | Size | Depends on               |
| --- | ---------------------------------------------------- | ---- | ------------------------ |
| 0   | P1 end-match + status guard, P2 derived clock        | M    | —                        |
| 1   | Cross-link pass (3.1)                                | S    | —                        |
| 2   | Viewer liveness: public + dashboard polling (3.2)    | M    | P1, P2                   |
| 3   | Match page parity: lineups, team bars, periods (3.3) | M    | —                        |
| 4   | Team page: results, form, stats, top scorers (3.4)   | M    | P1                       |
| 5   | Player match log (3.5)                               | S–M  | —                        |
| 6   | Competitions v1: ROUND_ROBIN standings (3.6)         | L    | P1                       |
| 7   | Home feed grouping (3.7)                             | S    | 6 for competition groups |

Items 1, 3 and 5 are independent and can interleave anywhere. The
league-night demo that sells the product is 0 → 2 → 6: record a match, watch
it move a live table someone's parent has open on their phone.
