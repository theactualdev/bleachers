import { z } from 'zod';
import { IdSchema } from './common.js';
import { MatchSideSchema } from './enums.js';

/**
 * The immutable match event — the single source of truth for all statistics.
 *
 * `type` is a sport-config event-type id (e.g. "goal", "yellow_card", "three_pt"), NOT a fixed
 * enum: this is what lets a new sport add event types by configuration alone.
 *
 * Events are append-only. The only permitted mutation is a correction that flips `voided`.
 */
export const MatchEventSchema = z.object({
  /** Client-generated UUID — also the idempotency key for offline batch upload. */
  id: IdSchema,
  matchId: IdSchema,
  /** Sport-config event-type id. Validated against the active sport config, not a DB enum. */
  type: z.string().min(1).max(64),
  side: MatchSideSchema,
  /** Nullable: some events are team-level (e.g. timeout, corner) with no single player. */
  playerId: IdSchema.nullable(),
  /** 1-based period/half/quarter/set index the event occurred in. */
  period: z.number().int().min(1).max(32),
  /** Match clock in milliseconds at the moment of the event (client-captured). */
  clockMs: z.number().int().min(0),
  /** Free-form, config-validated extras (e.g. { x: 34, y: 12, bodyPart: "head" }). */
  metadata: z.record(z.unknown()).default({}),
  /** Correction support: void hides the event from all stat derivations. */
  voided: z.boolean().default(false),
  voidedById: IdSchema.nullable(),
  voidedAt: z.string().datetime({ offset: true }).nullable(),
  /** When set, this event replaces the (voided) event with the given id. */
  replacesEventId: IdSchema.nullable(),
  recordedById: IdSchema,
  /** Server-assigned wall-clock time the event was persisted. */
  recordedAt: z.string().datetime({ offset: true }),
});
export type MatchEvent = z.infer<typeof MatchEventSchema>;

/**
 * Input for recording one event. The client supplies `id` (UUID) so the create is idempotent and
 * so optimistic UI can reference the event before the server responds.
 */
export const RecordEventSchema = z.object({
  id: IdSchema,
  matchId: IdSchema,
  type: z.string().min(1).max(64),
  side: MatchSideSchema,
  playerId: IdSchema.nullable().optional(),
  period: z.number().int().min(1).max(32),
  clockMs: z.number().int().min(0).default(0),
  metadata: z.record(z.unknown()).optional(),
  replacesEventId: IdSchema.nullable().optional(),
  /** Client capture time; server still stamps its own `recordedAt`. */
  clientRecordedAt: z.string().datetime({ offset: true }).optional(),
});
export type RecordEventInput = z.infer<typeof RecordEventSchema>;

/** Offline sync: upload a batch of queued events. Upserts on `id` — safe to replay. */
export const BatchUploadSchema = z.object({
  matchId: IdSchema,
  events: z.array(RecordEventSchema).min(1).max(500),
});
export type BatchUploadInput = z.infer<typeof BatchUploadSchema>;

export const BatchUploadResultSchema = z.object({
  accepted: z.array(IdSchema),
  /** Ids that were already present (idempotent replays). */
  duplicates: z.array(IdSchema),
  rejected: z.array(z.object({ id: IdSchema, reason: z.string() })),
});
export type BatchUploadResult = z.infer<typeof BatchUploadResultSchema>;

/** Correcting an event: void it, optionally providing a replacement to append. */
export const VoidEventSchema = z.object({
  replacement: RecordEventSchema.omit({ replacesEventId: true }).optional(),
});
export type VoidEventInput = z.infer<typeof VoidEventSchema>;
