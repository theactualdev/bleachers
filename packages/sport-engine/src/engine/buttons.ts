import type { StatTier } from '@bleachers/types';
import type { ButtonGroup, ChainPrompt, EventTypeDef, SportConfig } from '../config/schema.js';

/** A resolved button: a group's event-type id joined to its full definition, for the UI to render. */
export interface ScoringButton {
  group: string;
  groupLabel: string;
  eventType: EventTypeDef;
}

/**
 * Resolve the button layout for a tier into concrete buttons. The UI renders these generically —
 * it never checks the sport. ADVANCED returns the ADVANCED layout (which already folds in basics).
 */
export function getScoringButtons(config: SportConfig, tier: StatTier): ScoringButton[] {
  const byId = new Map(config.eventTypes.map((e) => [e.id, e]));
  const groups: ButtonGroup[] = config.buttonLayout[tier];
  const buttons: ScoringButton[] = [];
  for (const group of groups) {
    for (const id of group.eventTypeIds) {
      const eventType = byId.get(id);
      if (eventType) {
        buttons.push({ group: group.id, groupLabel: group.label, eventType });
      }
    }
  }
  return buttons;
}

/** The grouped button layout (preserving groups), for laying out sections in the UI. */
export function getButtonGroups(
  config: SportConfig,
  tier: StatTier,
): Array<{ id: string; label: string; buttons: EventTypeDef[] }> {
  const byId = new Map(config.eventTypes.map((e) => [e.id, e]));
  return config.buttonLayout[tier].map((group) => ({
    id: group.id,
    label: group.label,
    buttons: group.eventTypeIds
      .map((id) => byId.get(id))
      .filter((e): e is EventTypeDef => e !== undefined),
  }));
}

/** The chained follow-up prompts to show after recording a given event type (e.g. Goal → assist). */
export function getChainedPrompts(config: SportConfig, eventTypeId: string): ChainPrompt[] {
  return config.eventTypes.find((e) => e.id === eventTypeId)?.chains ?? [];
}

/** Look up a single event-type definition. */
export function getEventType(config: SportConfig, eventTypeId: string): EventTypeDef | undefined {
  return config.eventTypes.find((e) => e.id === eventTypeId);
}

/** Validate that an event type exists and is permitted at the given tier. */
export function isEventTypeAllowed(
  config: SportConfig,
  eventTypeId: string,
  tier: StatTier,
): boolean {
  const def = config.eventTypes.find((e) => e.id === eventTypeId);
  if (!def) return false;
  return tier === 'ADVANCED' || def.tier === 'BASIC';
}
