'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ChevronRight, Play, Zap } from 'lucide-react';
import type { LineupSelection } from '@bleachers/types';
import { AuthGate } from '@/components/auth-gate';
import { PageHeader } from '@/components/page-header';
import { useCreateMatch, useRoster, useTeams } from '@/lib/hooks';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Spinner } from '@/components/ui/misc';
import { cn } from '@/lib/utils';

function CreateMatchFlow() {
  const router = useRouter();
  const { data: teams } = useTeams();
  const create = useCreateMatch();

  const [step, setStep] = useState(0);
  const [homeTeamId, setHome] = useState('');
  const [awayTeamId, setAway] = useState('');
  const [tier, setTier] = useState<'BASIC' | 'ADVANCED'>('BASIC');
  const [homeOut, setHomeOut] = useState<Set<string>>(new Set());
  const [awayOut, setAwayOut] = useState<Set<string>>(new Set());

  const canNextTeams = homeTeamId && awayTeamId && homeTeamId !== awayTeamId;

  const { data: homeRoster } = useRoster(homeTeamId);
  const { data: awayRoster } = useRoster(awayTeamId);

  const homeLineup: LineupSelection[] = useMemo(
    () =>
      (homeRoster ?? [])
        .filter((r) => !homeOut.has(r.playerId))
        .map((r) => ({ playerId: r.playerId, isStarter: true })),
    [homeRoster, homeOut],
  );
  const awayLineup: LineupSelection[] = useMemo(
    () =>
      (awayRoster ?? [])
        .filter((r) => !awayOut.has(r.playerId))
        .map((r) => ({ playerId: r.playerId, isStarter: true })),
    [awayRoster, awayOut],
  );

  async function start(startNow: boolean) {
    const match = await create.mutateAsync({
      sport: 'FOOTBALL',
      homeTeamId,
      awayTeamId,
      statTier: tier,
      startNow,
      homeLineup,
      awayLineup,
    });
    router.replace(startNow ? `/matches/${match.id}/live` : `/`);
  }

  return (
    <>
      <PageHeader title="New match" />
      <div className="space-y-4 p-4">
        <Steps current={step} labels={['Teams', 'Lineups', 'Start']} />

        {step === 0 && (
          <motion.div
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-4"
          >
            <TeamPicker
              label="Home"
              teams={teams ?? []}
              value={homeTeamId}
              exclude={awayTeamId}
              onChange={setHome}
            />
            <TeamPicker
              label="Away"
              teams={teams ?? []}
              value={awayTeamId}
              exclude={homeTeamId}
              onChange={setAway}
            />
            {teams && teams.length < 2 && (
              <p className="text-ink-3 text-sm">
                You need at least two teams. Create teams on the Teams tab first.
              </p>
            )}
            <Button className="w-full" disabled={!canNextTeams} onClick={() => setStep(1)}>
              Next: lineups <ChevronRight className="h-4 w-4" />
            </Button>
          </motion.div>
        )}

        {step === 1 && (
          <motion.div
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-4"
          >
            <LineupPicker
              title={teams?.find((t) => t.id === homeTeamId)?.name ?? 'Home'}
              roster={homeRoster ?? []}
              out={homeOut}
              toggle={(pid) => setHomeOut((s) => toggle(s, pid))}
            />
            <LineupPicker
              title={teams?.find((t) => t.id === awayTeamId)?.name ?? 'Away'}
              roster={awayRoster ?? []}
              out={awayOut}
              toggle={(pid) => setAwayOut((s) => toggle(s, pid))}
            />
            <p className="text-ink-3 text-xs">
              Tip: you can start with empty lineups and add players later — team-level events still
              work.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep(0)}>
                Back
              </Button>
              <Button className="flex-1" onClick={() => setStep(2)}>
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-4"
          >
            <div>
              <p className="text-eyebrow text-ink-3 mb-2">Stat detail</p>
              <div className="grid grid-cols-2 gap-2">
                <TierButton
                  active={tier === 'BASIC'}
                  onClick={() => setTier('BASIC')}
                  title="Basic"
                  hint="Goals, cards, subs"
                />
                <TierButton
                  active={tier === 'ADVANCED'}
                  onClick={() => setTier('ADVANCED')}
                  title="Advanced"
                  hint="Shots, duels, more"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 pt-2">
              <Button size="lg" disabled={create.isPending} onClick={() => start(true)}>
                {create.isPending ? <Spinner /> : <Play className="h-5 w-5" />} Start match now
              </Button>
              <Button
                size="lg"
                variant="outline"
                disabled={create.isPending}
                onClick={() => start(false)}
              >
                <Zap className="h-5 w-5" /> Save as scheduled
              </Button>
            </div>
            <Button variant="ghost" className="w-full" onClick={() => setStep(1)}>
              Back
            </Button>
          </motion.div>
        )}
      </div>
    </>
  );
}

function toggle(set: Set<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
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
          <span
            className={cn(
              'text-eyebrow',
              i === current ? 'text-ink-1' : 'text-ink-3',
            )}
          >
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

function TeamPicker({
  label,
  teams,
  value,
  exclude,
  onChange,
}: {
  label: string;
  teams: { id: string; name: string; colors: unknown }[];
  value: string;
  exclude: string;
  onChange: (id: string) => void;
}) {
  return (
    <div>
      <p className="text-eyebrow text-ink-3 mb-2">{label}</p>
      <div className="grid grid-cols-2 gap-2">
        {teams
          .filter((t) => t.id !== exclude)
          .map((t) => (
            <button
              key={t.id}
              onClick={() => onChange(t.id)}
              className={cn(
                'ease-spring flex items-center gap-2.5 rounded-md border p-3 text-left text-sm transition-all duration-200 active:scale-[0.98]',
                value === t.id
                  ? 'border-brand/50 bg-brand/10 text-ink-1'
                  : 'glass text-ink-2 hover:text-ink-1',
              )}
            >
              <span
                className="h-6 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: (t.colors as { primary: string }).primary }}
              />
              <span className="truncate font-semibold">{t.name}</span>
            </button>
          ))}
      </div>
    </div>
  );
}

function LineupPicker({
  title,
  roster,
  out,
  toggle,
}: {
  title: string;
  roster: { playerId: string; jerseyNumber: string | null; player: { name: string } }[];
  out: Set<string>;
  toggle: (playerId: string) => void;
}) {
  return (
    <Card className="p-4">
      <p className="text-ink-1 mb-3 text-sm font-semibold">{title}</p>
      {roster.length === 0 ? (
        <p className="text-ink-3 text-xs">No roster — add players on the team page.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {roster.map((r) => {
            const inLineup = !out.has(r.playerId);
            return (
              <button
                key={r.playerId}
                onClick={() => toggle(r.playerId)}
                className={cn(
                  'ease-spring rounded-pill border px-3 py-1.5 text-sm font-medium transition-all duration-200 active:scale-95',
                  inLineup
                    ? 'border-brand/50 bg-brand/10 text-ink-1'
                    : 'border-hairline text-ink-3 line-through',
                )}
              >
                {r.jerseyNumber ? `${r.jerseyNumber} · ` : ''}
                {r.player.name}
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function TierButton({
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
      onClick={onClick}
      className={cn(
        'ease-spring rounded-md border p-4 text-left transition-all duration-200 active:scale-[0.98]',
        active ? 'border-brand/50 bg-brand/10' : 'glass',
      )}
    >
      <div className="text-ink-1 font-semibold">{title}</div>
      <div className="text-ink-3 text-xs">{hint}</div>
    </button>
  );
}

export default function NewMatchPage() {
  return (
    <AuthGate>
      <CreateMatchFlow />
    </AuthGate>
  );
}
