import { describe, expect, it } from 'vitest';
import { pairStats } from './stat-comparison';

const sv = (key: string, value: number, label = key) => ({
  key,
  label,
  value,
  format: 'int' as const,
});

describe('pairStats', () => {
  it('pairs matching keys from both sides', () => {
    const rows = pairStats([sv('shots', 7)], [sv('shots', 3)]);
    expect(rows).toEqual([{ key: 'shots', label: 'shots', home: 7, away: 3, format: 'int' }]);
  });

  it('keeps a stat present on only one side, zero-filling the other', () => {
    const rows = pairStats([sv('corners', 4)], []);
    expect(rows).toEqual([{ key: 'corners', label: 'corners', home: 4, away: 0, format: 'int' }]);
  });

  it('drops rows where neither side did anything', () => {
    expect(pairStats([sv('fouls', 0)], [sv('fouls', 0)])).toEqual([]);
  });

  it('preserves home ordering, then appends away-only keys', () => {
    const rows = pairStats([sv('a', 1), sv('b', 2)], [sv('b', 1), sv('c', 5)]);
    expect(rows.map((r) => r.key)).toEqual(['a', 'b', 'c']);
  });

  it('prefers whichever side supplies a label', () => {
    const rows = pairStats(
      [{ key: 'x', label: '', value: 0, format: 'int' }],
      [sv('x', 2, 'Shots')],
    );
    expect(rows[0]!.label).toBe('Shots');
  });
});
