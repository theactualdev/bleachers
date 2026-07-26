'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { AuthGate } from '@/components/auth-gate';
import { PageHeader } from '@/components/page-header';
import { useTeams, useCreateTeam } from '@/lib/hooks';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { EmptyState, Skeleton, Spinner } from '@/components/ui/misc';
import { QueryErrorState } from '@/components/ui/query-error';

const COLORS = ['#1E90FF', '#E23B3B', '#22C55E', '#F59E0B', '#8B5CF6', '#111827'];

function TeamsScreen() {
  const { data: teams, isLoading, isError, error, refetch } = useTeams();
  const create = useCreateTeam();
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[0]!);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await create.mutateAsync({ name: name.trim(), colors: { primary: color }, sport: 'FOOTBALL' });
    setName('');
  }

  return (
    <>
      <PageHeader title="Teams" />
      <div className="space-y-4 p-4">
        <form onSubmit={add} className="space-y-2">
          <div className="flex gap-2">
            <Input
              placeholder="Team name…"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? <Spinner /> : <Plus className="h-4 w-4" />}
            </Button>
          </div>
          <div className="flex gap-2.5">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={`Colour ${c}`}
                className={`ring-offset-canvas ease-spring h-8 w-8 rounded-full ring-offset-2 transition-all duration-200 active:scale-90 ${
                  color === c ? 'ring-brand ring-2' : ''
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </form>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-[60px] w-full" />
            <Skeleton className="h-[60px] w-full" />
            <Skeleton className="h-[60px] w-full" />
          </div>
        ) : isError ? (
          <QueryErrorState what="teams" error={error} onRetry={() => refetch()} />
        ) : teams && teams.length === 0 ? (
          <EmptyState title="No teams yet" hint="Create a team, then add players to its roster." />
        ) : (
          <div className="space-y-2">
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
