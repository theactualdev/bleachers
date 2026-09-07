import { describe, expect, it } from 'vitest';
import { formChipClass } from './form-strip';

describe('formChipClass', () => {
  it('gives each result a distinct class', () => {
    const w = formChipClass('W');
    const d = formChipClass('D');
    const l = formChipClass('L');
    expect(new Set([w, d, l]).size).toBe(3);
  });

  it('uses the brand token for a win and negative for a loss', () => {
    expect(formChipClass('W')).toContain('brand');
    expect(formChipClass('L')).toContain('negative');
  });
});
