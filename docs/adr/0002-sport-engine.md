# ADR 0002 — Configuration-driven sport engine

**Status:** Accepted · Phase 1

## Context

The brief requires supporting Football, Basketball, and Volleyball with **one configurable scoring
engine**, where "adding another sport requires only configuration, not application code," and "no
sport-specific logic should exist inside UI components."

## Decision

Introduce `@bleachers/sport-engine`, a pure, framework-free package. A **`SportConfig`** (validated
JSON) fully describes a sport:

- `periods` — regulation structure, extra time, tiebreakers (penalties, deciding set…)
- `eventTypes` — id, label, tier (basic/advanced), icon, whether it scores, chained prompts
- `scoringRules` — how event types contribute to the score
- `derivedStats` — named formulas computed from event tallies (e.g. FG%, hitting efficiency)
- `buttonLayout` — ordered groups the UI renders (data, not code)
- `clock` — direction, default period length, whether it counts stoppage

The engine exposes pure functions:

- `reduceMatch(config, events) → MatchState` (score, per-period, per-player tallies)
- `deriveStats(config, tallies) → DerivedStats`
- `getScoringButtons(config, tier) → ButtonGroup[]`
- `getChainedPrompts(config, eventTypeId) → Prompt[]`

The UI and API both consume the engine. UI components receive `ButtonGroup[]` and render them
generically; they contain no `if (sport === 'football')` branches.

## Consequences

- ✅ Football/Basketball/Volleyball differ only by config file. A fourth sport is a fifth file.
- ✅ Engine is trivially unit-testable in isolation (no DB, no React).
- ✅ Same derivation runs on server (authoritative stats) and client (optimistic/offline stats).
- ⚠️ Config schema must be expressive enough for future sports; we validate configs with Zod and
  keep an escape hatch (`metadata`, custom derived-stat expressions) for edge cases.
