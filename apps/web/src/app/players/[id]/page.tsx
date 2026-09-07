'use client';

import { use } from 'react';
import Link from 'next/link';
import { AuthGate } from '@/components/auth-gate';
import { PageHeader } from '@/components/page-header';
import { usePlayerCareer, usePlayerMatches, usePlayers } from '@/lib/hooks';
import { ExpandablePhoto } from '@/components/ui/photo-viewer';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/misc';
import { StatGrid } from '@/components/stat-grid';
import { QueryErrorState } from '@/components/ui/query-error';

function PlayerProfile({ id }: { id: string }) {
  const { data: players } = usePlayers();
  const player = players?.find((p) => p.id === id);
  const { data: career, isLoading, isError, error, refetch } = usePlayerCareer(id);
  const { data: matches } = usePlayerMatches(id);

  return (
    <>
      <PageHeader title="Player" />
      <div className="space-y-4 px-4 py-2">
        <div className="flex items-center gap-4">
          <ExpandablePhoto src={player?.photo} name={player?.name} size="lg" />
          <div>
            <h1 className="font-display text-ink-1 text-2xl font-bold tracking-tight">
              {player?.name ?? 'Player'}
            </h1>
            <p className="text-ink-2 text-sm">
              {career?.appearances ?? 0} appearance{career?.appearances === 1 ? '' : 's'}
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : isError && !career ? (
          <QueryErrorState what="career stats" error={error} onRetry={() => refetch()} />
        ) : (
          <>
            <Card>
              <CardContent className="pt-5">
                <h2 className="text-eyebrow text-ink-3 mb-4">Career totals</h2>
                <StatGrid stats={career?.totals ?? []} />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <h2 className="text-eyebrow text-ink-3 mb-4">Per game</h2>
                <StatGrid stats={career?.averages ?? []} />
              </CardContent>
            </Card>
            {matches && matches.length > 0 && (
              <Card>
                <CardContent className="pt-5">
                  <h2 className="text-eyebrow text-ink-3 mb-3">Matches</h2>
                  <div className="flex flex-col gap-2.5">
                    {matches.map((m) => (
                      <Link key={m.matchId} href={`/matches/${m.matchId}`}>
                        <div className="border-hairline flex items-center gap-3 border-b pb-2.5 last:border-0">
                          <span
                            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-bold ${
                              m.result === 'W'
                                ? 'bg-brand/15 text-brand'
                                : m.result === 'L'
                                  ? 'bg-negative/15 text-negative'
                                  : 'bg-glass text-ink-3'
                            }`}
                          >
                            {m.result ?? '-'}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-ink-1 truncate text-sm font-medium">
                              v {m.opponentName}
                            </p>
                            <p className="text-ink-3 text-xs">
                              {new Date(m.scheduledAt).toLocaleDateString()}
                            </p>
                          </div>
                          <span className="font-display tabnums text-ink-1 text-base">
                            {m.score[0]}-{m.score[1]}
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </>
  );
}

export default function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <AuthGate>
      <PlayerProfile id={id} />
    </AuthGate>
  );
}
