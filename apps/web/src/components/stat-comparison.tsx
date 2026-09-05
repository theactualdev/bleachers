'use client';

import type { StatValue } from '@bleachers/types';

export interface ComparisonRow {
  key: string;
  label: string;
  home: number;
  away: number;
  format: StatValue['format'];
}

/**
 * Zip the two per-side stat arrays into comparison rows.
 *
 * The sides are independent arrays that need not share keys or order, so this
 * unions them: home ordering first (it is the more familiar reading order),
 * then any away-only keys. Rows where both sides are zero are dropped —
 * a wall of "0 vs 0" is noise, not information.
 */
export function pairStats(home: StatValue[], away: StatValue[]): ComparisonRow[] {
  const awayByKey = new Map(away.map((s) => [s.key, s]));
  const seen = new Set<string>();
  const rows: ComparisonRow[] = [];

  for (const h of home) {
    seen.add(h.key);
    const a = awayByKey.get(h.key);
    rows.push({
      key: h.key,
      label: h.label || a?.label || h.key,
      home: h.value,
      away: a?.value ?? 0,
      format: h.format,
    });
  }
  for (const a of away) {
    if (seen.has(a.key)) continue;
    rows.push({ key: a.key, label: a.label || a.key, home: 0, away: a.value, format: a.format });
  }
  return rows.filter((r) => r.home !== 0 || r.away !== 0);
}

function display(value: number, format: StatValue['format']): string {
  if (format === 'percent') return `${Math.round(value)}%`;
  if (format === 'decimal') return value.toFixed(1);
  return String(value);
}

/** Centred two-sided bars, the classic match-stats comparison. */
export function StatComparison({
  home,
  away,
  homeColor,
  awayColor,
}: {
  home: StatValue[];
  away: StatValue[];
  homeColor: string;
  awayColor: string;
}) {
  const rows = pairStats(home, away);
  if (rows.length === 0) return null;

  return (
    <div className="space-y-3">
      {rows.map((r) => {
        const total = r.home + r.away;
        // A 50/50 split for an all-zero total never renders (filtered above);
        // this guard is for a total that is zero only after rounding.
        const homePct = total > 0 ? (r.home / total) * 100 : 50;
        return (
          <div key={r.key}>
            <div className="text-ink-2 mb-1 flex items-baseline justify-between text-xs">
              <span className="tabnums text-ink-1 font-semibold">{display(r.home, r.format)}</span>
              <span className="text-eyebrow text-ink-3">{r.label}</span>
              <span className="tabnums text-ink-1 font-semibold">{display(r.away, r.format)}</span>
            </div>
            <div className="bg-glass flex h-1.5 overflow-hidden rounded-full">
              <div style={{ width: `${homePct}%`, backgroundColor: homeColor }} />
              <div style={{ width: `${100 - homePct}%`, backgroundColor: awayColor }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Per-period scoreline, e.g. "Half 1 1–0 · Half 2 1–1". */
export function PeriodScores({
  scores,
  periodLabel,
}: {
  scores: [number, number][];
  periodLabel: string;
}) {
  if (scores.length < 2) return null;
  return (
    <p className="text-ink-3 tabnums text-center text-xs">
      {scores.map(([h, a], i) => (
        <span key={i}>
          {i > 0 && <span className="mx-1.5">·</span>}
          {periodLabel} {i + 1}{' '}
          <span className="text-ink-2 font-medium">
            {h}–{a}
          </span>
        </span>
      ))}
    </p>
  );
}
