'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, Plus, X } from 'lucide-react';
import type { RegisterTeamInput, Team } from '@bleachers/types';
import { useRegisterTeam } from '@/lib/hooks';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ImagePicker } from '@/components/ui/image-picker';
import { Spinner } from '@/components/ui/misc';
import { cn } from '@/lib/utils';

/** Shared swatch palette — also used by the (legacy) inline team form. */
export const COLORS = ['#1E90FF', '#E23B3B', '#22C55E', '#F59E0B', '#8B5CF6', '#111827'];

const MAX_PLAYERS = 40;

type PlayerRow = { name: string; jerseyNumber: string; photo: string | null };

function emptyRow(): PlayerRow {
  return { name: '', jerseyNumber: '', photo: null };
}

function errorMessage(e: unknown, fallback: string) {
  return e instanceof ApiError ? e.message : fallback;
}

/**
 * Two-step team registration: Identity (name/colour/logo) then Squad
 * (repeatable, skippable player rows). Calls `useRegisterTeam` on submit and
 * hands the created team back via `onDone` — the caller decides what happens
 * next (redirect, close a wizard step, etc).
 *
 * `compact` drops the big step header and tightens paddings so the form can
 * be embedded inline (e.g. inside the new-match wizard) instead of standing
 * alone on its own page.
 */
export function TeamRegistrationForm({
  compact = false,
  onDone,
}: {
  compact?: boolean;
  onDone: (team: Team) => void;
}) {
  const register = useRegisterTeam();
  const [step, setStep] = useState<'identity' | 'squad'>('identity');
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[0]!);
  const [logo, setLogo] = useState<string | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);

  const canContinue = name.trim().length > 0;

  function updatePlayer(i: number, patch: Partial<PlayerRow>) {
    setPlayers((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addPlayer() {
    setPlayers((rows) => (rows.length >= MAX_PLAYERS ? rows : [...rows, emptyRow()]));
  }
  function removePlayer(i: number) {
    setPlayers((rows) => rows.filter((_, idx) => idx !== i));
  }

  async function submit() {
    const input: RegisterTeamInput = {
      name: name.trim(),
      colors: { primary: color },
      logo: logo ?? undefined,
      players: players
        .filter((p) => p.name.trim().length > 0)
        .map((p) => ({
          name: p.name.trim(),
          jerseyNumber: p.jerseyNumber.trim() || undefined,
          photo: p.photo ?? undefined,
        })),
    };
    const { team } = await register.mutateAsync(input);
    onDone(team);
  }

  return (
    <div className={cn('space-y-4', compact ? 'p-0' : 'p-4')}>
      {!compact && <Steps current={step === 'identity' ? 0 : 1} labels={['Identity', 'Squad']} />}

      {step === 'identity' && (
        <motion.div
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          className="space-y-4"
        >
          <div className="flex justify-center">
            <ImagePicker value={logo} onChange={setLogo} label="Team logo" shape="square" />
          </div>
          <Input placeholder="Team name…" value={name} onChange={(e) => setName(e.target.value)} />
          <div>
            <p className="text-eyebrow text-ink-3 mb-2">Colour</p>
            <div className="flex gap-2.5">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={`Colour ${c}`}
                  className={cn(
                    'ring-offset-canvas ease-spring h-8 w-8 rounded-full ring-offset-2 transition-all duration-200 active:scale-90',
                    color === c && 'ring-brand ring-2',
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <Button className="w-full" disabled={!canContinue} onClick={() => setStep('squad')}>
            Next: squad <ChevronRight className="h-4 w-4" />
          </Button>
        </motion.div>
      )}

      {step === 'squad' && (
        <motion.div
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          className="space-y-4"
        >
          <p className="text-ink-3 text-xs">
            You can add players later — team-level events still work.
          </p>

          {players.length > 0 && (
            <div className="space-y-2">
              {players.map((row, i) => (
                <PlayerRowCard
                  key={i}
                  row={row}
                  onChange={(patch) => updatePlayer(i, patch)}
                  onRemove={() => removePlayer(i)}
                />
              ))}
            </div>
          )}

          <Button
            type="button"
            variant="glass"
            className="w-full"
            onClick={addPlayer}
            disabled={players.length >= MAX_PLAYERS}
          >
            <Plus className="h-4 w-4" /> Add player
          </Button>

          {register.isError && (
            <p className="text-negative text-sm">
              {errorMessage(register.error, 'Could not register this team — try again')}
            </p>
          )}

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setStep('identity')}>
              Back
            </Button>
            <Button className="flex-1" disabled={register.isPending} onClick={() => void submit()}>
              {register.isPending ? <Spinner /> : 'Create team'}
            </Button>
          </div>
        </motion.div>
      )}
    </div>
  );
}

function PlayerRowCard({
  row,
  onChange,
  onRemove,
}: {
  row: PlayerRow;
  onChange: (patch: Partial<PlayerRow>) => void;
  onRemove: () => void;
}) {
  return (
    <Card className="flex items-center gap-3 p-3">
      <ImagePicker value={row.photo} onChange={(url) => onChange({ photo: url })} shape="circle" />
      <div className="flex min-w-0 flex-1 gap-2">
        <Input
          placeholder="Player name…"
          value={row.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className="flex-1"
        />
        <Input
          placeholder="#"
          value={row.jerseyNumber}
          onChange={(e) =>
            onChange({ jerseyNumber: e.target.value.replace(/\D/g, '').slice(0, 3) })
          }
          inputMode="numeric"
          className="w-14 text-center"
        />
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove player"
        className="text-ink-3 hover:text-negative ease-spring shrink-0 transition-colors duration-200 active:scale-90"
      >
        <X className="h-4 w-4" />
      </button>
    </Card>
  );
}

function Steps({ current, labels }: { current: number; labels: string[] }) {
  return (
    <div className="flex items-center gap-2">
      {labels.map((label, i) => (
        <div key={label} className="flex flex-1 flex-col items-center gap-1.5">
          <div
            className={cn(
              'h-1.5 w-full rounded-full transition-colors duration-300',
              i <= current ? 'bg-brand' : 'bg-glass',
            )}
          />
          <span className={cn('text-eyebrow', i === current ? 'text-ink-1' : 'text-ink-3')}>
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}
