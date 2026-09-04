import { describe, expect, it } from 'vitest';
import { isInPlay } from './use-now';

describe('isInPlay', () => {
  it('is true only while the match is live or paused', () => {
    expect(isInPlay('LIVE')).toBe(true);
    expect(isInPlay('PAUSED')).toBe(true);
    expect(isInPlay('SCHEDULED')).toBe(false);
    expect(isInPlay('COMPLETED')).toBe(false);
    expect(isInPlay('ABANDONED')).toBe(false);
  });
});
