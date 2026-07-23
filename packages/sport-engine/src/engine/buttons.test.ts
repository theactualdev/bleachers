import { describe, expect, it } from 'vitest';
import { footballConfig } from '../config/football.js';
import {
  getButtonGroups,
  getChainedPrompts,
  getScoringButtons,
  isEventTypeAllowed,
} from './buttons.js';

describe('button/config helpers', () => {
  it('returns only basic buttons for the BASIC tier', () => {
    const buttons = getScoringButtons(footballConfig, 'BASIC');
    const ids = new Set(buttons.map((b) => b.eventType.id));
    expect(ids.has('goal')).toBe(true);
    expect(ids.has('shot')).toBe(false); // advanced
  });

  it('returns advanced buttons for the ADVANCED tier', () => {
    const buttons = getScoringButtons(footballConfig, 'ADVANCED');
    const ids = new Set(buttons.map((b) => b.eventType.id));
    expect(ids.has('goal')).toBe(true);
    expect(ids.has('shot')).toBe(true);
  });

  it('exposes goal → assist as a chained prompt', () => {
    const prompts = getChainedPrompts(footballConfig, 'goal');
    expect(prompts).toHaveLength(1);
    expect(prompts[0]!.recordsEventType).toBe('assist');
    expect(prompts[0]!.optional).toBe(true);
  });

  it('groups buttons for layout', () => {
    const groups = getButtonGroups(footballConfig, 'BASIC');
    expect(groups.find((g) => g.id === 'scoring')?.buttons.map((b) => b.id)).toEqual([
      'goal',
      'own_goal',
    ]);
  });

  it('gates advanced event types out of basic matches', () => {
    expect(isEventTypeAllowed(footballConfig, 'shot', 'BASIC')).toBe(false);
    expect(isEventTypeAllowed(footballConfig, 'shot', 'ADVANCED')).toBe(true);
    expect(isEventTypeAllowed(footballConfig, 'goal', 'BASIC')).toBe(true);
    expect(isEventTypeAllowed(footballConfig, 'nonexistent', 'ADVANCED')).toBe(false);
  });
});
