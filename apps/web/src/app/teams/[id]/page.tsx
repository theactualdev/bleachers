'use client';

import { use, useState } from 'react';
import { UserPlus } from 'lucide-react';
import { AuthGate } from '@/components/auth-gate';
import { PageHeader } from '@/components/page-header';
import {
  useAddToRoster,
  useCreateTeamPlayer,
  usePlayers,
  useRoster,
  useTeamMemberships,
  useTeams,
} from '@/lib/hooks';
import { ApiError } from '@/lib/api';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ImagePicker } from '@/components/ui/image-picker';
import { Input } from '@/components/ui/input';
import { Select, type SelectOption } from '@/components/ui/select';
import { EmptyState, Skeleton, Spinner } from '@/components/ui/misc';
import { QueryErrorState } from '@/components/ui/query-error';

function errorMessage(e: unknown, fallback: string) {
  return e instanceof ApiError ? e.message : fallback;
}

/** Compact "add a brand-new player straight onto this roster" form. */
function NewPlayerForm({ teamId }: { teamId: string }) {
  const createPlayer = useCreateTeamPlayer(teamId);
  const [name, setName] = useState('');
  const [jerseyNumber, setJerseyNumber] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);

  const canSubmit = name.trim().length > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    await createPlayer.mutateAsync({
      name: name.trim(),
      jerseyNumber: jerseyNumber.trim() || undefined,
      photo: photo ?? undefined,
    });
    setName('');
    setJerseyNumber('');
    setPhoto(null);
  }

  return (
    <Card className="p-3">
      <p className="text-eyebrow text-ink-3 mb-3">New player</p>
      <form onSubmit={submit} className="space-y-3">
        <div className="flex items-center gap-3">
          <ImagePicker value={photo} onChange={setPhoto} shape="circle" />
          <div className="flex min-w-0 flex-1 gap-2">
            <Input
              placeholder="Player name…"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1"
            />
            <Input
              placeholder="#"
              value={jerseyNumber}
              onChange={(e) => setJerseyNumber(e.target.value.replace(/\D/g, '').slice(0, 3))}
              inputMode="numeric"
              className="w-14 text-center"
            />
          </div>
        </div>
        {createPlayer.isError && (
          <p className="text-negative text-sm">
            {errorMessage(createPlayer.error, 'Could not add this player — try again')}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={!canSubmit || createPlayer.isPending}>
          {createPlayer.isPending ? <Spinner /> : <UserPlus className="h-4 w-4" />} Add player
        </Button>
      </form>
    </Card>
  );
}

function TeamProfile({ id }: { id: string }) {
  const { data: teams } = useTeams();
  const team = teams?.find((t) => t.id === id);
  const { data: roster, isLoading, isError, error, refetch } = useRoster(id);
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
          emptyLabel={
            players && players.length ? 'Everyone is already on this team' : 'No players yet'
          }
          aria-label="Add player to roster"
          onChange={onAdd}
        />

        <NewPlayerForm teamId={id} />

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-[60px] w-full" />
            <Skeleton className="h-[60px] w-full" />
            <Skeleton className="h-[60px] w-full" />
          </div>
        ) : isError && !roster ? (
          <QueryErrorState what="the roster" error={error} onRetry={() => refetch()} />
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
                  <Avatar src={r.player.photo} name={r.player.name} size="sm" />
                  <span className="text-ink-1 font-semibold">{r.player.name}</span>
                  {r.jerseyNumber && (
                    <span className="text-ink-3 ml-auto text-sm font-semibold">
                      #{r.jerseyNumber}
                    </span>
                  )}
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
