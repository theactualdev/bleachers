import type { StatValue } from '@bleachers/types';

function formatValue(s: StatValue): string {
  if (s.format === 'percent') return `${s.value}%`;
  if (s.format === 'decimal') return s.value.toFixed(2).replace(/\.00$/, '');
  return String(s.value);
}

/** A responsive grid of glass stat tiles. Reused across player, match, and team views. */
export function StatGrid({ stats }: { stats: StatValue[] }) {
  if (stats.length === 0) {
    return <p className="text-ink-3 text-sm">No stats yet.</p>;
  }
  return (
    <div className="grid grid-cols-3 gap-2.5">
      {stats.map((s) => (
        <div key={s.key} className="glass rounded-md px-2 py-3 text-center">
          <div className="font-display tabnums text-stat text-ink-1">{formatValue(s)}</div>
          <div className="text-ink-3 mt-1 text-[11px] font-medium leading-tight">{s.label}</div>
        </div>
      ))}
    </div>
  );
}
