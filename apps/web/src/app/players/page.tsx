'use client';

import { useState } from 'react';
import Link from 'next/link';
import { UserPlus } from 'lucide-react';
import { AuthGate } from '@/components/auth-gate';
import { PageHeader } from '@/components/page-header';
import { usePlayers, useCreatePlayer } from '@/lib/hooks';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { EmptyState, Skeleton, Spinner } from '@/components/ui/misc';

function PlayersScreen() {
  const { data: players, isLoading } = usePlayers();
  const create = useCreatePlayer();
  const [name, setName] = useState('');

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await create.mutateAsync({ name: name.trim() });
    setName('');
  }

  return (
    <>
      <PageHeader title="Players" />
      <div className="space-y-4 p-4">
        <form onSubmit={add} className="flex gap-2">
          <Input
            placeholder="Add a player…"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? <Spinner /> : <UserPlus className="h-4 w-4" />}
          </Button>
        </form>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-[58px] w-full" />
            <Skeleton className="h-[58px] w-full" />
            <Skeleton className="h-[58px] w-full" />
          </div>
        ) : players && players.length === 0 ? (
          <EmptyState title="No players yet" hint="Add players to build teams and rosters." />
        ) : (
          <div className="space-y-2">
            {players?.map((p) => (
              <Link key={p.id} href={`/players/${p.id}`}>
                <Card className="ease-spring flex items-center gap-3 p-3 transition-all duration-200 active:scale-[0.99]">
                  <div className="glass font-display text-ink-1 flex h-10 w-10 items-center justify-center rounded-full text-base font-bold">
                    {p.name.slice(0, 2).toUpperCase()}
                  </div>
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
