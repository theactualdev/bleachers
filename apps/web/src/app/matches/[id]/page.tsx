'use client';

import { use } from 'react';
import Link from 'next/link';
import { Download, Play, Share2 } from 'lucide-react';
import { getEventType, getSportConfig } from '@bleachers/sport-engine';
import { AuthGate } from '@/components/auth-gate';
import { PageHeader } from '@/components/page-header';
import { useMatch, useMatchStats, usePlayers } from '@/lib/hooks';
import { Scoreboard } from '@/components/scoring/scoreboard';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/misc';
import { StatGrid } from '@/components/stat-grid';
import { QueryErrorState } from '@/components/ui/query-error';
import { API_URL } from '@/lib/api';
import { formatMinute } from '@/lib/utils';

function MatchDetail({ id }: { id: string }) {
  const { data: match, isLoading, isError, error, refetch } = useMatch(id);
  const { data: stats } = useMatchStats(id);
  const { data: players } = usePlayers();

  if (isError) {
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
  const homeColor = (match.homeTeam.colors as { primary: string }).primary;
  const awayColor = (match.awayTeam.colors as { primary: string }).primary;

  return (
    <>
      <PageHeader title="Match" eyebrow={config.name} />
      <div className="space-y-4 px-4 py-2">
        <Scoreboard
          homeName={match.homeTeam.name}
          awayName={match.awayTeam.name}
          homeColor={homeColor}
          awayColor={awayColor}
          score={stats?.score ?? [0, 0]}
          clockLabel={match.status}
          periodLabel={config.name}
          live={match.status === 'LIVE'}
        />

        <div className="flex gap-2">
          {(match.status === 'LIVE' || match.status === 'SCHEDULED') && (
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
                    {t.playerId && <span className="text-ink-3">· {nameOf(t.playerId)}</span>}
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
                      {nameOf(p.playerId)}{' '}
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
