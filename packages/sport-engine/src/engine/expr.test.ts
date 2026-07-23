import { describe, expect, it } from 'vitest';
import { evaluateExpression } from './expr.js';

describe('evaluateExpression', () => {
  it('does basic arithmetic with precedence', () => {
    expect(evaluateExpression('2 + 3 * 4', {})).toBe(14);
    expect(evaluateExpression('(2 + 3) * 4', {})).toBe(20);
    expect(evaluateExpression('10 - 2 - 3', {})).toBe(5);
  });

  it('resolves identifiers from the tally, defaulting missing to 0', () => {
    expect(evaluateExpression('goal + assist', { goal: 3, assist: 2 })).toBe(5);
    expect(evaluateExpression('goal + missing', { goal: 3 })).toBe(3);
  });

  it('returns 0 on division by zero (empty-data safe)', () => {
    expect(evaluateExpression('made / attempts', { made: 5, attempts: 0 })).toBe(0);
    expect(evaluateExpression('made / attempts', {})).toBe(0);
  });

  it('computes a percentage formula', () => {
    expect(evaluateExpression('shot_on_target / shot * 100', { shot_on_target: 3, shot: 4 })).toBe(
      75,
    );
  });

  it('handles unary minus', () => {
    expect(evaluateExpression('-5 + 8', {})).toBe(3);
  });

  it('throws on illegal characters (no eval escape hatch)', () => {
    expect(() => evaluateExpression('goal; process.exit()', {})).toThrow();
  });
});
