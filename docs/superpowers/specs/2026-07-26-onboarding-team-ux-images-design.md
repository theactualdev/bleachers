# Seamless Onboarding, Team-Born Players & Images

**Status:** Approved design · 2026-07-26
**Scope:** Team-centric registration (players are created through teams), a match wizard that never dead-ends, crop-based image uploads for team logos and player photos, and explicit error states for failed data loads.
**Sequencing:** Spec 2 of 2 — executed after Organizations (`2026-07-26-organizations-design.md`). Everything here is written against the org model: "the user's data" means "the active org's data", creation requires SCORER+, and all new endpoints take org context per Spec 1's rules.

## Context

Three product instructions from the owner after first production use, plus one incident-driven fix:

1. A user with no teams finds the match-creation page empty and dead-ends.
2. Logos and player face photos should be uploadable.
3. Players must be registered through a team, not standalone.
4. (Incident) When API calls fail, list screens render blank instead of an error — misdiagnosed in production as "my data is gone". Failed loads must be visible and retryable.

Decisions locked with the owner: inline team creation inside the match wizard; Players tab becomes read-only browse; interactive crop UI for uploads; **the standalone `POST /api/players` endpoint is removed** so team-scoped creation is enforced server-side.

## 1. Team registration flow

### UI — `/teams/new` (and embedded variant)

Two steps in the Floodlight-amber glass system:

- **Step 1 — Identity:** name (required), team color (existing palette picker), logo (optional; upload → crop → square preview; removable).
- **Step 2 — Squad:** repeatable player rows — name (required per row), jersey number (optional), face photo (optional; same crop flow). Zero rows is valid ("You can add players later — team-level events still work"). Submit creates everything atomically and lands on the team page (standalone) or returns to the wizard (embedded).

The current inline name+color form on `/teams` is replaced by a "New team" button → `/teams/new`.

### API — composite registration

```
POST /api/teams/register        (SCORER+, org from X-Organization-Id)
```

```ts
RegisterTeamSchema = {
  name: string(1..120),
  colors: TeamColorsSchema,
  logo?: url | null,
  players: Array<{ name: string(1..120), jerseyNumber?: string | null, photo?: url | null }>(0..40),
}
→ { team, roster: RosterEntryWithPlayer[] }
```

One transaction: create team → create players (each with `organizationId`, `createdById`) → create roster entries. Existing `POST /api/teams` remains for API completeness but the web app stops using it.

## 2. Team-born players

- **Remove** `POST /api/players` (controller + service `create`). Player creation paths are exactly: `POST /api/teams/register` and the new `POST /api/teams/:id/players`.
- **`POST /api/teams/:id/players`** (SCORER+): `{ name, jerseyNumber?, photo? }` → creates the player and its roster entry in one transaction; returns `RosterEntryWithPlayer`. Powers a "New player" inline mini-form on the team page, next to the existing add-existing-player dropdown (which stays, org-scoped).
- **Players tab** becomes read-only: search/browse the org's players (photo avatar, name, teams-subtext), tapping through to the existing career profile. The add-player form is removed. `PATCH /api/players/:id` stays (edit name/photo from the profile page, SCORER+).

## 3. Match wizard never dead-ends

- **Step 0 (teams):** when the active org has fewer than 2 teams, the wizard renders the embedded team-registration form (compact variant) inline — "Create your first/second team" — instead of empty pickers. After each creation the wizard refreshes its team list and continues. When teams exist, a `+ New team` tile sits beside the team pickers opening the same embedded form.
- The dashboard's empty-state CTA is unchanged — it now leads somewhere that always works.
- Wizard copy never references the Teams tab as a prerequisite anymore.

## 4. Images: crop UI + Supabase Storage

### Client

- New `ImagePicker` component: file/camera input → `react-easy-crop` dialog (pinch-zoom, square aspect) → canvas export **512×512 WebP, quality 0.85** (falls back to JPEG where WebP encoding is unavailable) → upload → returns URL into the form.
- New `Avatar` component (used for both team logos and player photos): renders the image, falling back to the current color-bar (teams) or initials (players). Applied at: team pickers, team page header, match cards, scoreboard, roster rows, chain dialog, player tiles on live scoring, Players tab, player profile, public match and org pages.

### API

```
POST /api/media/upload          (SCORER+, multipart field "file")
→ { url }
```

- Validates: MIME in `image/webp | image/jpeg | image/png`, size ≤ 2 MB (multer limits; body stays comfortably under Nest defaults).
- Stores to Supabase Storage via the service-role client: **public bucket `media`**, key `<orgId>/<uuid>.<ext>`; returns the public URL. The bucket is ensured lazily at first upload (`createBucket` with public read, ignore already-exists) — no dashboard step.
- No deletion/GC in v1 (replaced images orphan; acceptable at avatar sizes — noted as future work).
- `Team.logo` / `Player.photo` columns already accept URLs; no schema change.

### Privacy note

Uploaded object URLs are public-but-unguessable (uuid keys) in v1, consistent with the app's unlisted-link sharing model. Player photos render only where player data already renders.

## 5. Error states (the incident fix)

- New `QueryErrorState` component (glass card: "Couldn't load <thing>" + failure reason when available + Retry button wired to React Query `refetch`).
- Every data-driven screen distinguishes **loading / error / empty / data**: dashboard, Teams, Players, team page, player profile, match detail, match wizard (team list), live scoring (initial match load). Blank-on-error becomes impossible.
- The match wizard specifically: a failed teams query shows the error card — never the empty-state/inline-creation path (which is reserved for a _successful_ fetch returning <2 teams).

## Dependencies

- Web: add `react-easy-crop` (pinned). API: add `multer` + `@types/multer` (pinned; Nest's `FileInterceptor` uses it).

## Testing

- **API integration (live DB):** `teams/register` composite (team + players + roster atomically; rollback on invalid row); `POST /api/teams/:id/players` creates + rosters atomically; `POST /api/players` returns 404 (route gone); upload endpoint rejects oversize/wrong-MIME and stores/returns a fetchable public URL for a valid file (cleanup: remove the object after assert).
- **Web unit:** `ImagePicker` crop-export contract (mocked canvas), `QueryErrorState` retry wiring, wizard step-0 branch logic (loading vs error vs <2 teams vs pickers).
- **E2E:** fresh org → open New match → create two teams (one with players) entirely inside the wizard → reach lineups → start match. Error-state smoke: with the API origin blocked, the dashboard shows the error card, not blankness.
- Full gate green before merge.

## Out of scope

- Image deletion/GC, EXIF stripping beyond canvas re-encode (canvas export inherently drops EXIF), non-square crops, gallery/multiple images, org logo upload UI on the org settings page (uses the same `ImagePicker` — included here as the one exception since the component exists), player merge/dedupe tooling.
