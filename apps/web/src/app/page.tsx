'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { AuthGate } from '@/components/auth-gate';
import { PageHeader } from '@/components/page-header';
import { MatchCard } from '@/components/match-card';
import { useMatches } from '@/lib/hooks';
import { Button } from '@/components/ui/button';
import { EmptyState, Skeleton } from '@/components/ui/misc';
import { QueryErrorState } from '@/components/ui/query-error';

function Dashboard() {
  const { data: matches, isLoading, isError, error, refetch } = useMatches();
  const live = matches?.filter((m) => m.status === 'LIVE') ?? [];
  const rest = matches?.filter((m) => m.status !== 'LIVE') ?? [];

  return (
    <>
      <PageHeader
        title="Bleachers"
        eyebrow="Live scoring"
        action={
          <Link href="/matches/new">
            <Button size="sm">
              <Plus className="h-4 w-4" strokeWidth={2.5} /> Match
            </Button>
          </Link>
        }
      />

      <div className="space-y-8 px-4 py-2">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : isError ? (
          <QueryErrorState what="matches" error={error} onRetry={() => refetch()} />
        ) : matches && matches.length === 0 ? (
          <div className="pt-6">
            <EmptyState
              title="No matches yet"
              hint="Spin up your first match — teams, lineups, and live scoring in under 30 seconds."
              action={
                <Link href="/matches/new">
                  <Button size="lg">
                    <Plus className="h-5 w-5" strokeWidth={2.5} /> Create a match
                  </Button>
                </Link>
              }
            />
          </div>
        ) : (
          <>
            {live.length > 0 && (
              <Section eyebrow="Live now" count={live.length}>
                {live.map((m, i) => (
                  <StaggerItem key={m.id} index={i}>
                    <MatchCard match={m} />
                  </StaggerItem>
                ))}
              </Section>
            )}
            {rest.length > 0 && (
              <Section eyebrow="All matches" count={rest.length}>
                {rest.map((m, i) => (
                  <StaggerItem key={m.id} index={live.length + i}>
                    <MatchCard match={m} />
                  </StaggerItem>
                ))}
              </Section>
            )}
          </>
        )}
      </div>
    </>
  );
}

function Section({
  eyebrow,
  count,
  children,
}: {
  eyebrow: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline gap-2 px-1">
        <h2 className="text-eyebrow text-ink-3">{eyebrow}</h2>
        <span className="text-eyebrow text-ink-3 opacity-60">{count}</span>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function StaggerItem({ index, children }: { index: number; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.06, 0.4), duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

export default function HomePage() {
  return (
    <AuthGate>
      <Dashboard />
    </AuthGate>
  );
}
