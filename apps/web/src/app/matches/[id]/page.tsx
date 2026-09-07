'use client';

import { use } from 'react';
import Link from 'next/link';
import { Download, Play, Share2 } from 'lucide-react';
import { deriveElapsedMs, getEventType, getSportConfig } from '@bleachers/sport-engine';
import type { TeamColors } from '@bleachers/types';
import { AuthGate } from '@/components/auth-gate';
import { PageHeader } from '@/components/page-header';
import { useCompetition, useMatch, useMatchStats, usePlayers } from '@/lib/hooks';
import { Scoreboard } from '@/components/scoring/scoreboard';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/misc';
import { StatGrid } from '@/components/stat-grid';
import { Lineups } from '@/components/lineups';
import { PeriodScores, StatComparison } from '@/components/stat-comparison';
import { QueryErrorState } from '@/components/ui/query-error';
import { API_URL } from '@/lib/api';
import { isInPlay, useNow } from '@/lib/use-now';
import { formatClock, formatMinute } from '@/lib/utils';

function MatchDetail({ id }: { id: string }) {
  // The match row is cheap, so poll it unconditionally here — that is how a
  // viewer sitting on this page sees a kickoff or a full time land. Stats are
  // heavier, so they only poll while the match is actually in play.
  const { data: match, isLoading, isError, error, refetch } = useMatch(id, { refetchMs: 10_000 });
  const inPlay = isInPlay(match?.status ?? '');
  const { data: stats } = useMatchStats(id, { refetchMs: inPlay ? 10_000 : undefined });
  const { data: players } = usePlayers();
  // The hook is enabled-guarded on a falsy id, so an unlinked match makes no request.
  const { data: competition } = useCompetition(match?.competitionId ?? '');
  const now = useNow(match?.status === 'LIVE');

  if (isError && !match) {
    return (
      <>
        <PageHeader title="Match" />
        <div className="px-4 py-2">
          <QueryErrorState what="the match" error={error} onRetry={() => refetch()} />
        </div>
      </>
    );
  }

  if (isLoading || !match) {
    return (
      <>
        <PageHeader title="Match" />
        <div className="space-y-4 px-4 py-2">
          <Skeleton className="h-28 w-full" />
          <div className="flex gap-2">
            <Skeleton className="h-11 flex-1" />
            <Skeleton className="h-11 flex-1" />
            <Skeleton className="h-11 flex-1" />
          </div>
          <Skeleton className="h-40 w-full" />
        </div>
      </>
    );
  }

  const config = getSportConfig(match.sport);
  const nameOf = (pid: string | null) =>
    pid ? (players?.find((p) => p.id === pid)?.name ?? 'Player') : '';
  const homeColors = match.homeTeam.colors as TeamColors;
  const awayColors = match.awayTeam.colors as TeamColors;
  const homeColor = homeColors.primary;
  const awayColor = awayColors.primary;

  return (
    <>
      <PageHeader title="Match" eyebrow={config.name} />
      {competition && (
        <div className="px-4 pt-2">
          <Link
            href={`/competitions/${competition.id}`}
            className="text-brand text-sm font-medium hover:underline"
          >
            {competition.name}
          </Link>
        </div>
      )}
      <div className="space-y-4 px-4 py-2">
        <Scoreboard
          homeName={match.homeTeam.name}
          awayName={match.awayTeam.name}
          homeLogo={match.homeTeam.logo}
          awayLogo={match.awayTeam.logo}
          homeColors={homeColors}
          awayColors={awayColors}
          score={stats?.score ?? [0, 0]}
          clockLabel={
            match.status === 'COMPLETED'
              ? 'FT'
              : match.status === 'ABANDONED'
                ? 'Abandoned'
                : match.status === 'SCHEDULED'
                  ? new Date(match.scheduledAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : formatClock(deriveElapsedMs(match, now))
          }
          periodLabel={config.name}
          live={match.status === 'LIVE'}
          homeHref={`/teams/${match.homeTeamId}`}
          awayHref={`/teams/${match.awayTeamId}`}
        />

        {stats && stats.scoreByPeriod.length > 1 && (
          <PeriodScores scores={stats.scoreByPeriod} periodLabel={config.periods.periodLabel} />
        )}

        <div className="flex gap-2">
          {(match.status === 'LIVE' ||
            match.status === 'PAUSED' ||
            match.status === 'SCHEDULED') && (
            <Link href={`/matches/${id}/live`} className="flex-1">
              <Button className="w-full">
                <Play className="h-4 w-4" /> Score live
              </Button>
            </Link>
          )}
          <Link href={`/m/${id}`} target="_blank" className="flex-1">
            <Button variant="glass" className="w-full">
              <Share2 className="h-4 w-4" /> Public
            </Button>
          </Link>
          <a href={`${API_URL}/api/public/matches/${id}/export.csv`} className="flex-1">
            <Button variant="glass" className="w-full">
              <Download className="h-4 w-4" /> CSV
            </Button>
          </a>
        </div>

        {match.lineups.length > 0 && (
          <Card>
            <CardContent className="pt-5">
              <h2 className="text-eyebrow text-ink-3 mb-4">Lineups</h2>
              <Lineups
                lineups={match.lineups}
                homeName={match.homeTeam.name}
                awayName={match.awayTeam.name}
                nameOf={(pid) => nameOf(pid)}
              />
            </CardContent>
          </Card>
        )}

        {stats && stats.timeline.length > 0 && (
          <Card>
            <CardContent className="pt-5">
              <h2 className="text-eyebrow text-ink-3 mb-3">Timeline</h2>
              <div className="space-y-1.5">
                {[...stats.timeline].reverse().map((t) => (
                  <div key={t.eventId} className="text-ink-1 flex items-center gap-2.5 text-sm">
                    <span className="text-ink-3 tabnums w-8 shrink-0 text-xs">
                      {formatMinute(t.clockMs)}
                    </span>
                    <span
                      className="h-4 w-1 shrink-0 rounded-full"
                      style={{ backgroundColor: t.side === 'HOME' ? homeColor : awayColor }}
                    />
                    <span className="font-medium">
                      {getEventType(config, t.type)?.label ?? t.label}
                    </span>
                    {t.playerId && (
                      <Link href={`/players/${t.playerId}`} className="text-ink-3 hover:text-ink-1">
                        · {nameOf(t.playerId)}
                      </Link>
                    )}
                    {t.isScoring && (
                      <span className="font-display tabnums text-ink-1 ml-auto text-base">
                        {t.scoreAfter[0]}–{t.scoreAfter[1]}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {stats && stats.players.length > 0 && (
          <Card>
            <CardContent className="pt-5">
              <h2 className="text-eyebrow text-ink-3 mb-4">Player stats</h2>
              <div className="space-y-4">
                {stats.players.map((p) => (
                  <div key={p.playerId}>
                    <p className="text-ink-1 mb-2 text-sm font-semibold">
                      <Link href={`/players/${p.playerId}`} className="hover:underline">
                        {nameOf(p.playerId)}
                      </Link>{' '}
                      <span className="text-ink-3 text-xs font-normal">
                        {p.side === 'HOME' ? match.homeTeam.name : match.awayTeam.name}
                      </span>
                    </p>
                    <StatGrid stats={p.stats.filter((s) => s.value !== 0)} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {stats && (
          <Card>
            <CardContent className="pt-5">
              <h2 className="text-eyebrow text-ink-3 mb-4">Match stats</h2>
              <StatComparison
                home={stats.teamStats.HOME}
                away={stats.teamStats.AWAY}
                homeColor={homeColor}
                awayColor={awayColor}
              />
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}

export default function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <AuthGate>
      <MatchDetail id={id} />
    </AuthGate>
  );
}
