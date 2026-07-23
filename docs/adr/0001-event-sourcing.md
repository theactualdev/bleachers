# ADR 0001 — Event sourcing with derived statistics

**Status:** Accepted · Phase 1

## Context

Bleachers records live sports statistics. Requirements: corrections without data loss, an audit
trail, offline capture with later reconciliation, and statistics at many granularities (match,
player career, team, competition) that must always agree with each other.

## Decision

Model the domain as an **append-only event stream**. The `Event` table is the only write target
for match activity. Events are **immutable**:

- No `UPDATE` except a correction, which sets `voided = true` (+ `voidedBy`, `voidedAt`).
- No `DELETE`, ever.
- A correction may append a **replacement** event carrying `replacesEventId`.

**All statistics are derived** by folding the (non-voided) event stream through
`@bleachers/sport-engine`. We never persist a mutable counter (score, goals, points…).

## Consequences

- ✅ Corrections are lossless and auditable; undo is "void the last event".
- ✅ Offline capture is natural: buffer events locally, replay them; UUID ids make replay
  idempotent.
- ✅ New derived stats can be added retroactively — they recompute from history.
- ⚠️ Reads cost a fold over events. Mitigation: per-match streams are small (hundreds of events);
  cache computed snapshots in memory / HTTP layer, keyed by the match's latest event version.
- ⚠️ Config/rule changes must be handled carefully so historical matches still reduce correctly.
  Mitigation: sport configs are versioned and events store the `sport` they were recorded under.
