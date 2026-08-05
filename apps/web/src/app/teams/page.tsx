'use client';

import Link from 'next/link';
import { Plus } from 'lucide-react';
import { AuthGate } from '@/components/auth-gate';
import { PageHeader } from '@/components/page-header';
import { useTeams } from '@/lib/hooks';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, Skeleton } from '@/components/ui/misc';
import { QueryErrorState } from '@/components/ui/query-error';

function TeamsScreen() {
  const { data: teams, isLoading, isError, error, refetch } = useTeams();

  return (
    <>
      <PageHeader
        title="Teams"
        action={
          <Link href="/teams/new">
            <Button size="sm">
              <Plus className="h-4 w-4" /> New team
            </Button>
          </Link>
        }
      />
      <div className="space-y-4 p-4">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-[60px] w-full" />
            <Skeleton className="h-[60px] w-full" />
            <Skeleton className="h-[60px] w-full" />
          </div>
        ) : isError && !teams ? (
          <QueryErrorState what="teams" error={error} onRetry={() => refetch()} />
        ) : teams && teams.length === 0 ? (
          <EmptyState
            title="No teams yet"
            hint="Create a team, then add players to its roster."
            action={
              <Link href="/teams/new">
                <Button>
                  <Plus className="h-4 w-4" /> New team
                </Button>
              </Link>
            }
          />
        ) : (
          <div className="flex flex-col gap-2.5">
            {/*
              flex + gap, not space-y: `space-y` applies margin-top, which does
              nothing on the inline <a> that Link renders, so the cards sat
              flush. Flex items are blockified, so gap always applies.
            */}
            {teams?.map((t) => (
              <Link key={t.id} href={`/teams/${t.id}`}>
                <Card className="ease-spring flex items-center gap-3 p-3 transition-all duration-200 active:scale-[0.99]">
                  <span
                    className="h-9 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: (t.colors as { primary: string }).primary }}
                  />
                  <span className="text-ink-1 font-semibold">{t.name}</span>
                  {t.isAdHoc && <span className="text-ink-3 text-eyebrow ml-auto">ad-hoc</span>}
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export default function TeamsPage() {
  return (
    <AuthGate>
      <TeamsScreen />
    </AuthGate>
  );
}
