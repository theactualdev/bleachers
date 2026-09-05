'use client';

import type { MatchLineup } from '@bleachers/types';

/**
 * Two team sheets side by side. Deliberately a list, not a pitch: formations
 * are not modelled anywhere in this codebase, and inventing positions here
 * would be fiction. Starters first, then substitutes.
 *
 * `MatchLineup` carries no player name — only `playerId` — so the caller
 * passes the same `nameOf` resolver the rest of the page uses.
 */
function Side({
  title,
  rows,
  nameOf,
}: {
  title: string;
  rows: MatchLineup[];
  nameOf: (id: string) => string;
}) {
  const starters = rows.filter((r) => r.isStarter);
  const subs = rows.filter((r) => !r.isStarter);

  return (
    <div className="min-w-0">
      <p className="text-ink-1 mb-2 truncate text-sm font-semibold">{title}</p>
      {rows.length === 0 ? (
        <p className="text-ink-3 text-xs">No lineup recorded</p>
      ) : (
        <ul className="space-y-1.5">
          {starters.map((r) => (
            <li key={r.id} className="text-ink-2 flex items-baseline gap-2 text-sm">
              <span className="text-ink-3 tabnums w-6 shrink-0 text-xs">
                {r.jerseyNumberOverride ?? ''}
              </span>
              <span className="truncate">{nameOf(r.playerId)}</span>
            </li>
          ))}
          {subs.length > 0 && (
            <>
              <li className="text-eyebrow text-ink-3 pt-2">Substitutes</li>
              {subs.map((r) => (
                <li key={r.id} className="text-ink-3 flex items-baseline gap-2 text-sm">
                  <span className="tabnums w-6 shrink-0 text-xs">
                    {r.jerseyNumberOverride ?? ''}
                  </span>
                  <span className="truncate">{nameOf(r.playerId)}</span>
                </li>
              ))}
            </>
          )}
        </ul>
      )}
    </div>
  );
}

export function Lineups({
  lineups,
  homeName,
  awayName,
  nameOf,
}: {
  lineups: MatchLineup[];
  homeName: string;
  awayName: string;
  nameOf: (id: string) => string;
}) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <Side title={homeName} rows={lineups.filter((l) => l.side === 'HOME')} nameOf={nameOf} />
      <Side title={awayName} rows={lineups.filter((l) => l.side === 'AWAY')} nameOf={nameOf} />
    </div>
  );
}
