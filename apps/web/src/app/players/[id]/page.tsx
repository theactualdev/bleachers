'use client';

import { use } from 'react';
import { AuthGate } from '@/components/auth-gate';
import { PageHeader } from '@/components/page-header';
import { usePlayerCareer, usePlayers } from '@/lib/hooks';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/misc';
import { StatGrid } from '@/components/stat-grid';
import { QueryErrorState } from '@/components/ui/query-error';

function PlayerProfile({ id }: { id: string }) {
  const { data: players } = usePlayers();
  const player = players?.find((p) => p.id === id);
  const { data: career, isLoading, isError, error, refetch } = usePlayerCareer(id);

  return (
    <>
      <PageHeader title="Player" />
      <div className="space-y-4 px-4 py-2">
        <div className="flex items-center gap-4">
          <div className="glass font-display text-ink-1 flex h-16 w-16 items-center justify-center rounded-2xl text-2xl font-bold">
            {(player?.name ?? '?').slice(0, 2).toUpperCase()}
          </div>
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
        ) : isError ? (
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
