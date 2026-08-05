'use client';

import Link from 'next/link';
import { AuthGate } from '@/components/auth-gate';
import { PageHeader } from '@/components/page-header';
import { usePlayers } from '@/lib/hooks';
import { Card } from '@/components/ui/card';
import { Avatar } from '@/components/ui/avatar';
import { EmptyState, Skeleton } from '@/components/ui/misc';
import { QueryErrorState } from '@/components/ui/query-error';

function PlayersScreen() {
  const { data: players, isLoading, isError, error, refetch } = usePlayers();

  return (
    <>
      <PageHeader title="Players" />
      <div className="space-y-4 p-4">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-[58px] w-full" />
            <Skeleton className="h-[58px] w-full" />
            <Skeleton className="h-[58px] w-full" />
          </div>
        ) : isError && !players ? (
          <QueryErrorState what="players" error={error} onRetry={() => refetch()} />
        ) : players && players.length === 0 ? (
          <EmptyState title="No players yet" hint="Players join when you register a team." />
        ) : (
          <div className="flex flex-col gap-2.5">
            {/* flex + gap for the same reason as the teams list: `space-y` sets
                margin-top, which has no effect on the inline <a> Link renders. */}
            {players?.map((p) => (
              <Link key={p.id} href={`/players/${p.id}`}>
                <Card className="ease-spring flex items-center gap-3 p-3 transition-all duration-200 active:scale-[0.99]">
                  <Avatar src={p.photo} name={p.name} />
                  <span className="text-ink-1 font-semibold">{p.name}</span>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export default function PlayersPage() {
  return (
    <AuthGate>
      <PlayersScreen />
    </AuthGate>
  );
}
