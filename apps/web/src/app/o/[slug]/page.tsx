import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Sport, MatchStatus } from '@bleachers/types';
import { API_URL } from '@/lib/api-url';
import { Badge, LiveDot } from '@/components/ui/misc';

interface PublicTeam {
  id: string;
  name: string;
  colors: { primary: string; secondary?: string };
  logo: string | null;
  sport: Sport;
  isAdHoc: boolean;
}

interface PublicMatchRow {
  id: string;
  sport: Sport;
  status: MatchStatus;
  venue: string | null;
  scheduledAt: string;
  homeTeam: PublicTeam;
  awayTeam: PublicTeam;
}

interface PublicOrgProfile {
  org: { name: string; slug: string; logo: string | null };
  teams: PublicTeam[];
  recentMatches: PublicMatchRow[];
}

async function getOrg(slug: string): Promise<PublicOrgProfile | null> {
  const res = await fetch(`${API_URL}/api/public/orgs/${slug}`, { cache: 'no-store' });
  if (!res.ok) return null;
  return res.json();
}

export default async function PublicOrgPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getOrg(slug);
  if (!data) notFound();

  const { org, teams, recentMatches } = data;

  return (
    <div className="mx-auto max-w-2xl px-4 py-5">
      <header className="mb-4 flex items-center justify-between">
        <span className="font-display text-ink-1 text-lg font-bold uppercase tracking-tight">
          Bleachers
        </span>
        <Link href="/" className="text-ink-3 text-sm hover:underline">
          Open Bleachers
        </Link>
      </header>

      <div className="glass rim flex items-center gap-4 rounded-xl p-5">
        {org.logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- org.logo may be a data: URI
          <img
            src={org.logo}
            alt=""
            className="h-14 w-14 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="glass-strong font-display text-ink-1 flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-xl font-bold">
            {org.name.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="font-display text-ink-1 truncate text-2xl font-bold tracking-tight">
            {org.name}
          </h1>
          <p className="text-ink-3 text-sm">
            {teams.length} {teams.length === 1 ? 'team' : 'teams'}
          </p>
        </div>
      </div>

      <section className="mt-5">
        <h2 className="text-eyebrow text-ink-3 mb-2 px-1">Teams</h2>
        {teams.length === 0 ? (
          <div className="glass rim rounded-xl px-5 py-8 text-center">
            <p className="text-ink-2 text-sm">No teams yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {teams.map((t) => (
              <div key={t.id} className="glass rim flex items-center gap-3 rounded-xl p-3">
                <span
                  className="h-9 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: t.colors.primary }}
                />
                <span className="text-ink-1 font-semibold">{t.name}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-5">
        <h2 className="text-eyebrow text-ink-3 mb-2 px-1">Recent matches</h2>
        {recentMatches.length === 0 ? (
          <div className="glass rim rounded-xl px-5 py-8 text-center">
            <p className="text-ink-2 text-sm">No matches yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentMatches.map((m) => {
              const live = m.status === 'LIVE';
              return (
                <Link key={m.id} href={`/m/${m.id}`}>
                  <div className="glass rim ease-spring flex items-center gap-3 rounded-xl p-3 transition-all duration-200 active:scale-[0.99]">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <span
                        className="h-6 w-1 shrink-0 rounded-full"
                        style={{ backgroundColor: m.homeTeam.colors.primary }}
                      />
                      <span className="text-ink-1 truncate text-sm font-medium">
                        {m.homeTeam.name}
                      </span>
                      <span className="text-ink-3 shrink-0 text-xs">vs</span>
                      <span className="text-ink-1 truncate text-sm font-medium">
                        {m.awayTeam.name}
                      </span>
                      <span
                        className="h-6 w-1 shrink-0 rounded-full"
                        style={{ backgroundColor: m.awayTeam.colors.primary }}
                      />
                    </div>
                    <Badge variant={live ? 'live' : 'muted'} className="shrink-0">
                      {live && <LiveDot />}
                      {m.status}
                    </Badge>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <div className="text-ink-3 mt-5 flex items-center justify-center text-sm">
        <Link className="hover:underline" href="/">
          Open Bleachers
        </Link>
      </div>
    </div>
  );
}
