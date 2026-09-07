'use client';

import Link from 'next/link';
import type { StandingsEntry } from '@bleachers/types';

/**
 * A league table sized for a phone: position, team, played, goal difference and
 * points. W/D/L are dropped on purpose — at 375px eight numeric columns are
 * unreadable, and P/GD/Pts is what anyone actually scans for.
 *
 * Rows arrive already sorted by the engine, so this never re-sorts.
 */
export function StandingsTable({ rows }: { rows: StandingsEntry[] }) {
  if (rows.length === 0) return null;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-eyebrow text-ink-3">
          <th className="w-6 py-1 text-left font-normal">#</th>
          <th className="py-1 text-left font-normal">Team</th>
          <th className="w-8 py-1 text-right font-normal">P</th>
          <th className="w-10 py-1 text-right font-normal">GD</th>
          <th className="w-8 py-1 text-right font-normal">Pts</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.teamId} className="border-hairline border-t">
            <td className="tabnums text-ink-3 py-2">{i + 1}</td>
            <td className="text-ink-1 truncate py-2 font-medium">
              <Link href={`/teams/${r.teamId}`} className="hover:underline">
                {r.teamName}
              </Link>
            </td>
            <td className="tabnums text-ink-2 py-2 text-right">{r.played}</td>
            <td className="tabnums text-ink-2 py-2 text-right">
              {r.goalDifference > 0 ? `+${r.goalDifference}` : r.goalDifference}
            </td>
            <td className="tabnums text-ink-1 py-2 text-right font-bold">{r.points}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
