import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getEventType, getSportConfig } from '@bleachers/sport-engine';
import type { MatchStats, Sport } from '@bleachers/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface PublicMatch {
  match: { id: string; sport: Sport; status: string; venue: string | null; scheduledAt: string };
  homeTeam: { id: string; name: string; colors: { primary: string } };
  awayTeam: { id: string; name: string; colors: { primary: string } };
  playerNames: Record<string, string>;
  stats: MatchStats;
}

async function getMatch(id: string): Promise<PublicMatch | null> {
  const res = await fetch(`${API_URL}/api/public/matches/${id}`, { cache: 'no-store' });
  if (!res.ok) return null;
  return res.json();
}

function minute(ms: number): string {
  return `${Math.floor(ms / 60000)}'`;
}

export default async function PublicMatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getMatch(id);
  if (!data) notFound();

  const { match, homeTeam, awayTeam, playerNames, stats } = data;
  const config = getSportConfig(match.sport);

  const live = match.status === 'LIVE';
  return (
    <div className="mx-auto max-w-2xl px-4 py-5">
      <header className="mb-4 flex items-center justify-between">
        <span className="font-display text-ink-1 text-lg font-bold uppercase tracking-tight">
          Bleachers
        </span>
        <span
          className={`text-eyebrow rounded-pill inline-flex items-center gap-1.5 px-2.5 py-1 ${
            live
              ? 'text-live border-live/30 bg-live/10 border'
              : 'text-ink-2 border-hairline bg-glass border'
          }`}
        >
          {live && <span className="bg-live h-1.5 w-1.5 animate-pulse rounded-full" />}
          {match.status}
        </span>
      </header>

      <div className="glass rim relative overflow-hidden rounded-xl p-5">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-28 opacity-40 blur-2xl"
          style={{
            background: `radial-gradient(60% 100% at 12% 100%, ${homeTeam.colors.primary}, transparent 70%), radial-gradient(60% 100% at 88% 100%, ${awayTeam.colors.primary}, transparent 70%)`,
          }}
        />
        <div className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="flex items-center gap-2.5">
            <span
              className="h-7 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: homeTeam.colors.primary }}
            />
            <span className="text-ink-1 truncate font-semibold">{homeTeam.name}</span>
          </div>
          <div className="font-display tabnums text-ink-1 text-score flex items-center gap-2 leading-none">
            {stats.score[0]} <span className="text-ink-3 text-3xl">·</span> {stats.score[1]}
          </div>
          <div className="flex flex-row-reverse items-center gap-2.5">
            <span
              className="h-7 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: awayTeam.colors.primary }}
            />
            <span className="text-ink-1 truncate text-right font-semibold">{awayTeam.name}</span>
          </div>
        </div>
        {match.venue && (
          <p className="text-ink-3 relative mt-4 text-center text-xs">{match.venue}</p>
        )}
      </div>

      {stats.timeline.length > 0 && (
        <section className="glass rim mt-4 rounded-xl p-5">
          <h2 className="text-eyebrow text-ink-3 mb-3">Timeline</h2>
          <div className="space-y-1.5">
            {[...stats.timeline].reverse().map((t) => (
              <div key={t.eventId} className="text-ink-1 flex items-center gap-2.5 text-sm">
                <span className="text-ink-3 tabnums w-8 shrink-0 text-xs">{minute(t.clockMs)}</span>
                <span
                  className="h-4 w-1 shrink-0 rounded-full"
                  style={{
                    backgroundColor:
                      t.side === 'HOME' ? homeTeam.colors.primary : awayTeam.colors.primary,
                  }}
                />
                <span className="font-medium">
                  {getEventType(config, t.type)?.label ?? t.label}
                </span>
                {t.playerId && (
                  <span className="text-ink-3">· {playerNames[t.playerId] ?? 'Player'}</span>
                )}
                {t.isScoring && (
                  <span className="font-display tabnums text-ink-1 ml-auto text-base">
                    {t.scoreAfter[0]}–{t.scoreAfter[1]}
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="text-ink-2 mt-5 flex items-center justify-center gap-4 text-sm">
        <a
          className="text-brand font-medium hover:underline"
          href={`${API_URL}/api/public/matches/${id}/export.csv`}
        >
          Download CSV
        </a>
        <Link className="text-ink-3 hover:underline" href="/">
          Open Bleachers
        </Link>
      </div>
    </div>
  );
}
