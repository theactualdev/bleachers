'use client';

import { use } from 'react';
import Link from 'next/link';
import { AuthGate } from '@/components/auth-gate';
import { PageHeader } from '@/components/page-header';
import { useCompetition, useCompetitionMatches, useStandings, useTopScorers } from '@/lib/hooks';
import { MatchCard } from '@/components/match-card';
import { StandingsTable } from '@/components/standings-table';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState, Skeleton } from '@/components/ui/misc';
import { QueryErrorState } from '@/components/ui/query-error';

/** `ROUND_ROBIN` → `Round robin`. Enum values are never shown raw. */
function sentence(value: string): string {
  const words = value.toLowerCase().replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function CompetitionDetail({ id }: { id: string }) {
  const { data: competition, isLoading, isError, error, refetch } = useCompetition(id);
  const { data: standings } = useStandings(id);
  const { data: scorers } = useTopScorers(id);
  const { data: matches } = useCompetitionMatches(id);

  if (isError && !competition) {
    return (
      <>
        <PageHeader title="Competition" />
        <div className="px-4 py-2">
          <QueryErrorState what="this competition" error={error} onRetry={() => refetch()} />
        </div>
      </>
    );
  }

  if (isLoading || !competition) {
    return (
      <>
        <PageHeader title="Competition" />
        <div className="space-y-4 px-4 py-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </>
    );
  }

  // Same split as the club page: finished matches are results, everything still
  // to come or in progress is a fixture.
  const results = (matches ?? []).filter(
    (m) => m.status === 'COMPLETED' || m.status === 'ABANDONED',
  );
  const fixtures = (matches ?? []).filter(
    (m) => m.status === 'SCHEDULED' || m.status === 'LIVE' || m.status === 'PAUSED',
  );

  const isLeague = competition.format === 'ROUND_ROBIN';
  const isCollection = competition.format === 'COLLECTION';

  return (
    <>
      <PageHeader title="Competition" />
      <div className="space-y-4 px-4 py-2">
        <div>
          <h1 className="font-display text-ink-1 text-2xl font-bold tracking-tight">
            {competition.name}
          </h1>
          <p className="text-ink-3 text-sm">
            {sentence(competition.format)} · {sentence(competition.sport)}
          </p>
        </div>

        {isLeague && (
          <Card>
            <CardContent className="pt-5">
              <h2 className="text-eyebrow text-ink-3 mb-3">Table</h2>
              {standings && standings.length > 0 ? (
                <StandingsTable rows={standings} />
              ) : (
                <p className="text-ink-3 text-sm">
                  The table fills in as matches finish — nothing has been played yet.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/*
          Formats whose bracket logic does not exist yet say so, rather than
          rendering an empty grid the reader would assume is broken.
        */}
        {!isLeague && !isCollection && (
          <Card>
            <CardContent className="pt-5">
              <p className="text-ink-3 text-sm">
                Tables aren&apos;t generated for {sentence(competition.format).toLowerCase()}{' '}
                competitions yet — the matches below are all of it for now.
              </p>
            </CardContent>
          </Card>
        )}

        {scorers && scorers.length > 0 && (
          <Card>
            <CardContent className="pt-5">
              <h2 className="text-eyebrow text-ink-3 mb-3">Top scorers</h2>
              <div className="flex flex-col gap-2">
                {scorers.map((s) => (
                  <div
                    key={s.playerId}
                    className="border-hairline flex items-center justify-between border-b pb-2 last:border-0 last:pb-0"
                  >
                    <Link
                      href={`/players/${s.playerId}`}
                      className="text-ink-1 truncate text-sm font-medium hover:underline"
                    >
                      {s.playerName}
                    </Link>
                    <span className="font-display tabnums text-ink-1 text-base">{s.goals}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {fixtures.length > 0 && (
          <div>
            <h2 className="text-eyebrow text-ink-3 mb-2">Fixtures</h2>
            <div className="flex flex-col gap-2.5">
              {fixtures.map((m) => (
                <MatchCard key={m.id} match={m} />
              ))}
            </div>
          </div>
        )}

        {results.length > 0 && (
          <div>
            <h2 className="text-eyebrow text-ink-3 mb-2">Results</h2>
            <div className="flex flex-col gap-2.5">
              {results.map((m) => (
                <MatchCard key={m.id} match={m} />
              ))}
            </div>
          </div>
        )}

        {matches && matches.length === 0 && (
          <EmptyState
            title="No matches yet"
            hint="Matches join a competition when you pick it while creating them."
          />
        )}
      </div>
    </>
  );
}

export default function CompetitionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <AuthGate>
      <CompetitionDetail id={id} />
    </AuthGate>
  );
}
