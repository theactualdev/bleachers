'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import type { CompetitionFormat, Sport } from '@bleachers/types';
import { AuthGate } from '@/components/auth-gate';
import { PageHeader } from '@/components/page-header';
import { useCreateCompetition } from '@/lib/hooks';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/misc';
import { cn } from '@/lib/utils';

/**
 * The two formats that actually behave differently today. ROUND_ROBIN is the
 * only one with a table; COLLECTION is the honest bucket for friendlies.
 */
const PRIMARY_FORMATS: { value: CompetitionFormat; title: string; hint: string }[] = [
  {
    value: 'ROUND_ROBIN',
    title: 'League table',
    hint: 'Everyone plays everyone. Standings move as results land.',
  },
  {
    value: 'COLLECTION',
    title: 'Collection',
    hint: 'Just a group of matches — friendlies, one-offs.',
  },
];

/** Accepted and stored, but no bracket logic exists yet — the copy says so. */
const DEFERRED_FORMATS: { value: CompetitionFormat; title: string }[] = [
  { value: 'KNOCKOUT', title: 'Knockout' },
  { value: 'GROUPS', title: 'Groups' },
  { value: 'LADDER', title: 'Ladder' },
];

/** Only football has a scoring engine so far; the rest are enum-only. */
const SPORTS: { value: Sport; title: string; available: boolean }[] = [
  { value: 'FOOTBALL', title: 'Football', available: true },
  { value: 'BASKETBALL', title: 'Basketball', available: false },
  { value: 'VOLLEYBALL', title: 'Volleyball', available: false },
];

function errorMessage(e: unknown, fallback: string) {
  return e instanceof ApiError ? e.message : fallback;
}

function NewCompetitionScreen() {
  const router = useRouter();
  const create = useCreateCompetition();

  const [name, setName] = useState('');
  const [format, setFormat] = useState<CompetitionFormat>('ROUND_ROBIN');
  const [sport, setSport] = useState<Sport>('FOOTBALL');

  const canSubmit = name.trim().length > 0 && !create.isPending;

  async function submit() {
    const created = await create.mutateAsync({ name: name.trim(), sport, format });
    router.push(`/competitions/${created.id}`);
  }

  return (
    <>
      <PageHeader title="New competition" />
      <motion.div
        initial={{ opacity: 0, x: 12 }}
        animate={{ opacity: 1, x: 0 }}
        className="space-y-5 p-4"
      >
        <Input
          placeholder="Competition name…"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <div>
          <p className="text-eyebrow text-ink-3 mb-2">Format</p>
          <div className="grid grid-cols-2 gap-2">
            {PRIMARY_FORMATS.map((f) => (
              <ChoiceButton
                key={f.value}
                active={format === f.value}
                onClick={() => setFormat(f.value)}
                title={f.title}
                hint={f.hint}
              />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {DEFERRED_FORMATS.map((f) => (
              <button
                key={f.value}
                type="button"
                aria-pressed={format === f.value}
                onClick={() => setFormat(f.value)}
                className={cn(
                  'ease-spring rounded-pill border px-3 py-1.5 text-sm font-medium transition-all duration-200 active:scale-95',
                  format === f.value
                    ? 'border-brand bg-brand/10 text-ink-1'
                    : 'border-hairline text-ink-3',
                )}
              >
                {f.title}
              </button>
            ))}
          </div>
          <p className="text-ink-3 mt-2 text-xs">
            Knockout, groups and ladder keep their matches together, but no table is generated for
            them yet.
          </p>
        </div>

        <div>
          <p className="text-eyebrow text-ink-3 mb-2">Sport</p>
          <div className="flex flex-wrap gap-2">
            {SPORTS.map((s) => (
              <button
                key={s.value}
                type="button"
                aria-pressed={sport === s.value}
                disabled={!s.available}
                onClick={() => setSport(s.value)}
                className={cn(
                  'ease-spring rounded-pill border px-3 py-1.5 text-sm font-medium transition-all duration-200 active:scale-95 disabled:pointer-events-none disabled:opacity-40',
                  sport === s.value
                    ? 'border-brand bg-brand/10 text-ink-1'
                    : 'border-hairline text-ink-3',
                )}
              >
                {s.title}
                {!s.available && ' · soon'}
              </button>
            ))}
          </div>
        </div>

        {create.isError && (
          <p className="text-negative text-sm">
            {errorMessage(create.error, 'Could not create this competition — try again')}
          </p>
        )}

        <Button className="w-full" disabled={!canSubmit} onClick={() => void submit()}>
          {create.isPending ? <Spinner /> : 'Create competition'}
        </Button>
      </motion.div>
    </>
  );
}

/**
 * Radio-group tile, copied from the stat-tier picker on the new-match wizard:
 * `aria-pressed` carries the selection for anyone who cannot see the border.
 */
function ChoiceButton({
  active,
  onClick,
  title,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'ease-spring rounded-md border p-4 text-left transition-all duration-200 active:scale-[0.98]',
        active ? 'border-brand ring-brand/45 bg-brand/10 ring-2' : 'glass',
      )}
    >
      <div className={cn('font-semibold', active ? 'text-brand' : 'text-ink-1')}>{title}</div>
      <div className="text-ink-3 text-xs">{hint}</div>
    </button>
  );
}

export default function NewCompetitionPage() {
  return (
    <AuthGate>
      <NewCompetitionScreen />
    </AuthGate>
  );
}
