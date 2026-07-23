'use client';

import { use } from 'react';
import { AuthGate } from '@/components/auth-gate';
import { PageHeader } from '@/components/page-header';
import {
  useAddToRoster,
  usePlayers,
  useRoster,
  useTeamMemberships,
  useTeams,
} from '@/lib/hooks';
import { Card } from '@/components/ui/card';
import { Select, type SelectOption } from '@/components/ui/select';
import { EmptyState, Skeleton } from '@/components/ui/misc';

function TeamProfile({ id }: { id: string }) {
  const { data: teams } = useTeams();
  const team = teams?.find((t) => t.id === id);
  const { data: roster, isLoading } = useRoster(id);
  const { data: players } = usePlayers();
  const memberships = useTeamMemberships();
  const add = useAddToRoster(id);

  const rosterIds = new Set(roster?.map((r) => r.playerId) ?? []);

  // Available players + a subtext of the other teams each one already plays for.
  const options: SelectOption[] = (players ?? [])
    .filter((p) => !rosterIds.has(p.id))
    .map((p) => {
      const others = (memberships.get(p.id) ?? []).filter((t) => t.id !== id);
      return {
        value: p.id,
        label: p.name,
        sublabel: others.length ? `On ${others.map((t) => t.name).join(' · ')}` : 'No team yet',
      };
    });

  async function onAdd(playerId: string) {
    // Optimistic — the roster updates instantly; failures roll back in the hook.
    await add.mutateAsync({ playerId });
  }

  return (
    <>
      <PageHeader title="Team" />
      <div className="space-y-4 px-4 py-2">
        <div className="flex items-center gap-4">
          <span
            className="h-12 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: (team?.colors as { primary: string })?.primary ?? '#888' }}
          />
          <h1 className="font-display text-ink-1 text-2xl font-bold tracking-tight">
            {team?.name ?? 'Team'}
          </h1>
        </div>

        <Select
          value=""
          options={options}
          placeholder="Add player to roster…"
          emptyLabel={players && players.length ? 'Everyone is already on this team' : 'No players yet'}
          aria-label="Add player to roster"
          onChange={onAdd}
        />

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-[60px] w-full" />
            <Skeleton className="h-[60px] w-full" />
            <Skeleton className="h-[60px] w-full" />
          </div>
        ) : roster && roster.length === 0 ? (
          <EmptyState title="Empty roster" hint="Add players above to build this team." />
        ) : (
          <div className="space-y-2">
            {roster?.map((r) => {
              const pending = r.id.startsWith('optimistic-');
              return (
                <Card
                  key={r.id}
                  className={`flex items-center gap-3 p-3 transition-opacity ${pending ? 'opacity-60' : ''}`}
                >
                  <div className="glass font-display text-ink-1 flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold">
                    {r.jerseyNumber ?? r.player.name.slice(0, 2).toUpperCase()}
                  </div>
                  <span className="text-ink-1 font-semibold">{r.player.name}</span>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

export default function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <AuthGate>
      <TeamProfile id={id} />
    </AuthGate>
  );
}
