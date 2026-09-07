'use client';

import Link from 'next/link';
import { Plus, Trophy } from 'lucide-react';
import { AuthGate } from '@/components/auth-gate';
import { PageHeader } from '@/components/page-header';
import { useCompetitions } from '@/lib/hooks';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, Skeleton } from '@/components/ui/misc';
import { QueryErrorState } from '@/components/ui/query-error';

/** `ROUND_ROBIN` → `Round robin`. Enum values are never shown raw. */
function sentence(value: string): string {
  const words = value.toLowerCase().replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function CompetitionsScreen() {
  const { data: competitions, isLoading, isError, error, refetch } = useCompetitions();

  return (
    <>
      <PageHeader
        title="Competitions"
        action={
          <Link href="/competitions/new">
            <Button size="sm">
              <Plus className="h-4 w-4" /> New
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
        ) : isError && !competitions ? (
          <QueryErrorState what="competitions" error={error} onRetry={() => refetch()} />
        ) : competitions && competitions.length === 0 ? (
          <EmptyState
            title="No competitions yet"
            hint="Group matches into a league or a collection — a round robin keeps its own table."
            action={
              <Link href="/competitions/new">
                <Button>
                  <Plus className="h-4 w-4" /> New competition
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
            {competitions?.map((c) => (
              <Link key={c.id} href={`/competitions/${c.id}`}>
                <Card className="ease-spring flex items-center gap-3 p-3 transition-all duration-200 active:scale-[0.99]">
                  <span className="bg-glass text-ink-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-full">
                    <Trophy className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="text-ink-1 block truncate font-semibold">{c.name}</span>
                    <span className="text-ink-3 block truncate text-xs">
                      {sentence(c.format)} · {sentence(c.sport)}
                    </span>
                  </span>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export default function CompetitionsPage() {
  return (
    <AuthGate>
      <CompetitionsScreen />
    </AuthGate>
  );
}
