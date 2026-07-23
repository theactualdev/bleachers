import { z } from 'zod';
import { SportSchema, StatTierSchema } from '@bleachers/types';

/**
 * The SportConfig is the ENTIRE definition of a sport. Adding a sport = adding one of these.
 * No sport-specific branching exists anywhere else in the codebase.
 */

/** A follow-up prompt shown after recording a parent event (e.g. Goal → "Who assisted?"). */
export const ChainPromptSchema = z.object({
  /** Stable id for the prompt. */
  id: z.string().min(1),
  /** Title shown in the dialog, e.g. "Who assisted?". */
  title: z.string().min(1),
  /** Event type recorded if the prompt is answered (e.g. "assist"). */
  recordsEventType: z.string().min(1),
  /** Whether the scorer can skip it. */
  optional: z.boolean().default(true),
  /**
   * Which side the answer belongs to relative to the parent event:
   * SAME (assist by same team) or OPPONENT (e.g. "who won the rebound?" could differ).
   */
  side: z.enum(['SAME', 'OPPONENT']).default('SAME'),
});
export type ChainPrompt = z.infer<typeof ChainPromptSchema>;

/** How an event contributes to the score. */
export const ScoreEffectSchema = z.object({
  /** Add points to the SAME side as the event, or the OPPONENT (own goal). */
  side: z.enum(['SAME', 'OPPONENT']),
  points: z.number().int().min(1),
});
export type ScoreEffect = z.infer<typeof ScoreEffectSchema>;

export const EventTypeDefSchema = z.object({
  /** Stable id used on Event.type, in configs, and in derived-stat formulas. */
  id: z.string().min(1).max(64),
  label: z.string().min(1),
  /** Short label for compact buttons. */
  shortLabel: z.string().optional(),
  tier: StatTierSchema,
  /** Optional icon name (resolved by the UI icon map). */
  icon: z.string().optional(),
  /** Team-level events (timeout, corner) set this false. */
  requiresPlayer: z.boolean().default(true),
  /** Present when the event changes the score. */
  score: ScoreEffectSchema.optional(),
  /** Follow-up prompts to show after recording this event. */
  chains: z.array(ChainPromptSchema).default([]),
  /** Optional Tailwind-ish intent for button colouring: positive/negative/neutral. */
  intent: z.enum(['positive', 'negative', 'neutral']).default('neutral'),
});
export type EventTypeDef = z.infer<typeof EventTypeDefSchema>;

/** A named, derived statistic computed from event tallies via a safe arithmetic expression. */
export const DerivedStatDefSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  format: z.enum(['int', 'percent', 'decimal']).default('int'),
  scope: z.enum(['player', 'team']),
  /**
   * Arithmetic expression over event-type tally identifiers, e.g.
   * "made_2pt + made_3pt" or "kill / (kill + attack_error + attack_attempt) * 100".
   * Division by zero yields 0. Only + - * / ( ) and identifiers/numbers are allowed.
   */
  expr: z.string().min(1),
  /** Only compute for these tiers (defaults to all). */
  tiers: z.array(StatTierSchema).optional(),
});
export type DerivedStatDef = z.infer<typeof DerivedStatDefSchema>;

/** A labelled group of buttons the scoring UI renders (data, not code). */
export const ButtonGroupSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  eventTypeIds: z.array(z.string().min(1)).min(1),
});
export type ButtonGroup = z.infer<typeof ButtonGroupSchema>;

export const PeriodConfigSchema = z.object({
  /** Number of regulation periods (2 halves, 4 quarters, up to 5 sets…). */
  regulationCount: z.number().int().min(1).max(9),
  /** UI label for a period, e.g. "Half", "Quarter", "Set". */
  periodLabel: z.string().min(1),
  /** Nominal length of a period in ms (0 for point-based sports like volleyball). */
  periodLengthMs: z.number().int().min(0),
  /** Whether extra time is available. */
  allowsExtraTime: z.boolean().default(false),
  extraTimeCount: z.number().int().min(0).max(4).default(0),
  extraTimeLengthMs: z.number().int().min(0).default(0),
  /** Tiebreak method after regulation (+ extra time), if any. */
  tiebreak: z.enum(['NONE', 'PENALTIES', 'GOLDEN_POINT', 'DECIDING_SET']).default('NONE'),
  /**
   * For point-based periods (volleyball sets): first to N points, win by 2.
   * Ignored when 0.
   */
  pointsToWinPeriod: z.number().int().min(0).default(0),
  winByTwo: z.boolean().default(false),
});
export type PeriodConfig = z.infer<typeof PeriodConfigSchema>;

export const ClockConfigSchema = z.object({
  direction: z.enum(['UP', 'DOWN']),
  countsStoppage: z.boolean().default(false),
  /** Whether the sport is clock-driven at all (volleyball is not). */
  enabled: z.boolean().default(true),
});
export type ClockConfig = z.infer<typeof ClockConfigSchema>;

export const SportConfigSchema = z
  .object({
    sport: SportSchema,
    /** Config schema version; bumped when semantics change so old matches still reduce. */
    version: z.number().int().min(1),
    name: z.string().min(1),
    periods: PeriodConfigSchema,
    clock: ClockConfigSchema,
    eventTypes: z.array(EventTypeDefSchema).min(1),
    derivedStats: z.array(DerivedStatDefSchema).default([]),
    /** Event-type ids surfaced as per-player stat columns, in display order. */
    playerStatColumns: z.array(z.string()).default([]),
    /** Button layout per tier. ADVANCED implicitly also shows BASIC groups. */
    buttonLayout: z.object({
      BASIC: z.array(ButtonGroupSchema),
      ADVANCED: z.array(ButtonGroupSchema),
    }),
  })
  .superRefine((cfg, ctx) => {
    const ids = new Set(cfg.eventTypes.map((e) => e.id));
    // Every button references a defined event type.
    for (const tier of ['BASIC', 'ADVANCED'] as const) {
      for (const group of cfg.buttonLayout[tier]) {
        for (const etId of group.eventTypeIds) {
          if (!ids.has(etId)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `buttonLayout.${tier} references unknown event type "${etId}"`,
              path: ['buttonLayout', tier],
            });
          }
        }
      }
    }
    // Every chained prompt records a defined event type.
    for (const et of cfg.eventTypes) {
      for (const chain of et.chains) {
        if (!ids.has(chain.recordsEventType)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `event "${et.id}" chains to unknown event type "${chain.recordsEventType}"`,
            path: ['eventTypes'],
          });
        }
      }
    }
  });
export type SportConfig = z.infer<typeof SportConfigSchema>;
