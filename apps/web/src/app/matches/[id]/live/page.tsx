'use client';

import { use, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Flag, Pause, Play, RotateCcw, Share2, XCircle } from 'lucide-react';
import type { ChainPrompt, SportConfig } from '@bleachers/sport-engine';
import {
  canRecordInteractive,
  deriveElapsedMs,
  getChainedPrompts,
  getEventType,
  getSportConfig,
} from '@bleachers/sport-engine';
import type { MatchEvent, MatchSide, TeamColors } from '@bleachers/types';
import { AuthGate } from '@/components/auth-gate';
import { useMatch, useMatchClock, usePlayers } from '@/lib/hooks';
import { isInPlay, useNow } from '@/lib/use-now';
import { useLiveScoring } from '@/lib/scoring';
import { Scoreboard } from '@/components/scoring/scoreboard';
import { EventPicker } from '@/components/scoring/event-picker';
import { ChainDialog, type ChainPlayer } from '@/components/scoring/chain-dialog';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/misc';
import { QueryErrorState } from '@/components/ui/query-error';
import { cn, formatClock, formatMinute } from '@/lib/utils';

interface Selection {
  side: MatchSide;
  playerId: string | null;
  label: string;
}

function LiveScoring({ id }: { id: string }) {
  const router = useRouter();
  const { data: match, isLoading, isError, error, refetch } = useMatch(id);
  const { data: players } = usePlayers();
  const sport = match?.sport ?? 'FOOTBALL';
  const tier = match?.statTier ?? 'BASIC';
  const config = useMemo(() => getSportConfig(sport), [sport]);

  const { events, stats, record, undoLast } = useLiveScoring(id, sport, tier);
  const clock = useMatchClock(id);

  /**
   * Recording is only legitimate mid-match — the same predicate the API enforces on interactive
   * record/undo. It has to be checked here too: taps reach the server through the offline batch
   * endpoint, which stays status-exempt by design (late syncs are legitimate), so nothing else
   * would stop a tap after full time.
   */
  const status = match?.status ?? 'SCHEDULED';
  const canScore = canRecordInteractive(status);

  /**
   * The clock is derived, never counted: elapsed time is re-computed each second from the
   * server's timestamps, so a reload, a locked phone or a throttled tab resumes on the true
   * minute instead of 00:00.
   */
  const now = useNow(status === 'LIVE');
  const elapsedMs = match ? deriveElapsedMs(match, now) : 0;
  const period = match?.currentPeriod ?? 1;
  const running = status === 'LIVE';

  // Two-tap confirms for destructive lifecycle actions.
  const [confirming, setConfirming] = useState<null | 'END' | 'ABANDON'>(null);
  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(null), 4000);
    return () => clearTimeout(t);
  }, [confirming]);

  const [selection, setSelection] = useState<Selection | null>(null);
  const [chain, setChain] = useState<{
    prompt: ChainPrompt;
    parentSide: MatchSide;
    parentPlayerId: string | null;
  } | null>(null);

  const nameOf = (pid: string) => players?.find((p) => p.id === pid)?.name ?? 'Player';
  const photoOf = (pid: string) => players?.find((p) => p.id === pid)?.photo ?? null;
  const lineupFor = (side: MatchSide) =>
    (match?.lineups ?? [])
      .filter((l) => l.side === side)
      .map((l) => ({
        playerId: l.playerId,
        name: nameOf(l.playerId),
        jersey: l.jerseyNumberOverride,
        photo: photoOf(l.playerId),
      }));

  if (isError && !match) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4">
        <QueryErrorState what="the match" error={error} onRetry={() => refetch()} />
      </div>
    );
  }

  if (isLoading || !match) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  const homeColors = match.homeTeam.colors as TeamColors;
  const awayColors = match.awayTeam.colors as TeamColors;
  const homeColor = homeColors.primary;
  const awayColor = awayColors.primary;

  async function onPickEvent(eventTypeId: string) {
    if (!selection || !canScore) return;
    const def = getEventType(config, eventTypeId);
    await record({
      type: eventTypeId,
      side: selection.side,
      playerId: selection.playerId,
      period,
      clockMs: elapsedMs,
      requiresPlayer: def?.requiresPlayer ?? true,
    });
    const activeSide = selection.side;
    const activePlayer = selection.playerId;
    setSelection(null);
    // Chained prompt (e.g. Goal → assist).
    const prompts = getChainedPrompts(config, eventTypeId);
    if (prompts.length > 0) {
      setChain({ prompt: prompts[0]!, parentSide: activeSide, parentPlayerId: activePlayer });
    }
  }

  async function onChainAnswer(playerId: string) {
    if (!chain || !canScore) return;
    const side =
      chain.prompt.side === 'SAME'
        ? chain.parentSide
        : chain.parentSide === 'HOME'
          ? 'AWAY'
          : 'HOME';
    const def = getEventType(config, chain.prompt.recordsEventType);
    await record({
      type: chain.prompt.recordsEventType,
      side,
      playerId,
      period,
      clockMs: elapsedMs,
      requiresPlayer: def?.requiresPlayer ?? true,
    });
    setChain(null);
  }

  const chainPlayers: ChainPlayer[] = chain
    ? lineupFor(
        chain.prompt.side === 'SAME'
          ? chain.parentSide
          : chain.parentSide === 'HOME'
            ? 'AWAY'
            : 'HOME',
      )
        .filter((p) => p.playerId !== chain.parentPlayerId)
        .map((p) => ({ playerId: p.playerId, name: p.name, jersey: p.jersey, photo: p.photo }))
    : [];

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Top bar */}
      <div className="glass sticky top-0 z-10 flex items-center justify-between rounded-b-2xl border-x-0 border-t-0 px-3 py-2.5">
        <Link
          href="/"
          className="text-ink-2 hover:bg-glass hover:text-ink-1 rounded-full p-2 transition-colors"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            aria-label={running ? 'Pause match' : 'Resume match'}
            disabled={clock.isPending || !isInPlay(status)}
            onClick={() => clock.mutate({ action: running ? 'PAUSE' : 'RESUME' })}
          >
            {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="sm" disabled={!canScore} onClick={() => undoLast()}>
            <RotateCcw className="h-4 w-4" /> Undo
          </Button>
          <Button
            variant={confirming === 'END' ? 'brand' : 'ghost'}
            size="sm"
            disabled={clock.isPending || !isInPlay(status)}
            onClick={() => {
              if (confirming !== 'END') return setConfirming('END');
              clock.mutate({ action: 'END' }, { onSuccess: () => router.push(`/matches/${id}`) });
            }}
          >
            <Flag className="h-4 w-4" /> {confirming === 'END' ? 'Confirm FT' : 'Full time'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label={confirming === 'ABANDON' ? 'Confirm abandon' : 'Abandon match'}
            disabled={clock.isPending || status === 'COMPLETED' || status === 'ABANDONED'}
            onClick={() => {
              if (confirming !== 'ABANDON') return setConfirming('ABANDON');
              clock.mutate(
                { action: 'ABANDON' },
                { onSuccess: () => router.push(`/matches/${id}`) },
              );
            }}
          >
            <XCircle className={cn('h-4 w-4', confirming === 'ABANDON' && 'text-negative')} />
          </Button>
          <Link
            href={`/m/${id}`}
            target="_blank"
            className="text-ink-2 hover:bg-glass hover:text-ink-1 rounded-md p-2 transition-colors"
            aria-label="Public page"
          >
            <Share2 className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <div className="space-y-4 p-3">
        <Scoreboard
          homeName={match.homeTeam.name}
          awayName={match.awayTeam.name}
          homeLogo={match.homeTeam.logo}
          awayLogo={match.awayTeam.logo}
          homeColors={homeColors}
          awayColors={awayColors}
          score={stats.score}
          clockLabel={formatClock(elapsedMs)}
          periodLabel={`${config.periods.periodLabel} ${period}`}
        />

        {/* Scoring is closed unless the match is in play. Say why, and offer the way out. */}
        {!canScore && (
          <div className="space-y-2">
            <p className="glass text-ink-2 rounded-md px-3 py-2.5 text-center text-sm">
              {status === 'COMPLETED'
                ? 'Full time — scoring is closed for this match.'
                : status === 'ABANDONED'
                  ? 'This match was abandoned — scoring is closed.'
                  : 'Kick off to start recording events.'}
            </p>
            {status === 'SCHEDULED' && (
              <Button
                size="lg"
                className="w-full"
                disabled={clock.isPending}
                onClick={() => clock.mutate({ action: 'KICKOFF' })}
              >
                <Play className="h-5 w-5" /> Kick off
              </Button>
            )}
          </div>
        )}

        {/*
         * Outside the `!canScore` branch on purpose: every lifecycle control (pause, resume,
         * period, full time, abandon) is only tappable while the match IS in play, which is
         * exactly when that branch is unmounted. Nested here, a failed transition would be
         * silent — no toast layer exists to catch it.
         */}
        {clock.isError && (
          <p className="text-negative text-center text-xs">{clock.error.message}</p>
        )}

        {/* Period selector */}
        <div className="flex items-center justify-center gap-2">
          {Array.from({ length: config.periods.regulationCount }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              disabled={clock.isPending || !isInPlay(status)}
              onClick={() => clock.mutate({ action: 'SET_PERIOD', period: p })}
              className={cn(
                'ease-spring rounded-pill h-9 px-4 text-sm font-semibold transition-all duration-200 active:scale-95 disabled:pointer-events-none disabled:opacity-40',
                period === p
                  ? 'bg-brand text-brand-ink shadow-button'
                  : 'glass text-ink-2 hover:text-ink-1',
              )}
            >
              {config.periods.periodLabel} {p}
            </button>
          ))}
        </div>

        {/* Two-tap: tap a player (or Team), then an event */}
        <div className="grid grid-cols-2 gap-3">
          <SideColumn
            side="HOME"
            teamName={match.homeTeam.name}
            logo={match.homeTeam.logo}
            colors={homeColors}
            players={lineupFor('HOME')}
            disabled={!canScore}
            onSelect={(sel) => setSelection(sel)}
          />
          <SideColumn
            side="AWAY"
            teamName={match.awayTeam.name}
            logo={match.awayTeam.logo}
            colors={awayColors}
            players={lineupFor('AWAY')}
            disabled={!canScore}
            onSelect={(sel) => setSelection(sel)}
          />
        </div>

        <Timeline
          events={events}
          config={config}
          nameOf={nameOf}
          homeColor={homeColor}
          awayColor={awayColor}
        />
      </div>

      <EventPicker
        config={config}
        tier={tier}
        open={!!selection}
        subtitle={selection?.label ?? ''}
        onPick={onPickEvent}
        onClose={() => setSelection(null)}
      />
      <ChainDialog
        prompt={chain?.prompt ?? null}
        players={chainPlayers}
        onAnswer={onChainAnswer}
        onSkip={() => setChain(null)}
      />
    </div>
  );
}

function SideColumn({
  side,
  teamName,
  logo,
  colors,
  players,
  disabled,
  onSelect,
}: {
  side: MatchSide;
  teamName: string;
  logo?: string | null;
  colors: TeamColors;
  players: { playerId: string; name: string; jersey: string | null; photo: string | null }[];
  disabled: boolean;
  onSelect: (sel: Selection) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Avatar src={logo} name={teamName} color={colors} size="sm" shape="square" />
        <span className="text-ink-1 truncate text-sm font-semibold">{teamName}</span>
      </div>
      <button
        disabled={disabled}
        onClick={() => onSelect({ side, playerId: null, label: `${teamName} · team event` })}
        className="text-ink-3 hover:bg-glass hover:text-ink-2 border-hairline w-full rounded-md border border-dashed py-2 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-40"
      >
        Team event
      </button>
      <div className="grid grid-cols-2 gap-2">
        {players.map((p) => (
          <button
            key={p.playerId}
            disabled={disabled}
            onClick={() => onSelect({ side, playerId: p.playerId, label: `${p.name}` })}
            className="glass ease-spring flex h-24 flex-col items-center justify-center gap-1 rounded-md px-1 text-center transition-all duration-200 active:scale-95 disabled:pointer-events-none disabled:opacity-40"
          >
            <Avatar src={p.photo} name={p.jersey ?? p.name} size="sm" />
            {p.jersey && (
              <span className="font-display text-ink-1 text-xs font-bold leading-none">
                {p.jersey}
              </span>
            )}
            <span className="text-ink-2 line-clamp-2 text-[11px] leading-tight">{p.name}</span>
          </button>
        ))}
        {players.length === 0 && (
          <p className="text-ink-3 col-span-2 text-center text-xs">No lineup</p>
        )}
      </div>
    </div>
  );
}

function Timeline({
  events,
  config,
  nameOf,
  homeColor,
  awayColor,
}: {
  events: MatchEvent[];
  config: SportConfig;
  nameOf: (id: string) => string;
  homeColor: string;
  awayColor: string;
}) {
  const labelOf = (type: string) => getEventType(config, type)?.label ?? type;
  const rows = [...events]
    .filter((e) => !e.voided)
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
    .slice(0, 20);

  if (rows.length === 0) {
    return (
      <p className="text-ink-3 py-6 text-center text-sm">No events yet — tap a player to start.</p>
    );
  }
  return (
    <div className="space-y-1.5">
      <p className="text-eyebrow text-ink-3 px-1">Timeline</p>
      {rows.map((e) => (
        <div
          key={e.id}
          className="glass text-ink-1 flex items-center gap-2.5 rounded-md px-3 py-2 text-sm"
        >
          <span className="text-ink-3 tabnums w-8 shrink-0 text-xs">{formatMinute(e.clockMs)}</span>
          <span
            className="h-5 w-1 shrink-0 rounded-full"
            style={{ backgroundColor: e.side === 'HOME' ? homeColor : awayColor }}
          />
          <span className="font-medium">{labelOf(e.type)}</span>
          {e.playerId && <span className="text-ink-3 truncate">· {nameOf(e.playerId)}</span>}
        </div>
      ))}
    </div>
  );
}

export default function LiveMatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <AuthGate>
      <LiveScoring id={id} />
    </AuthGate>
  );
}
