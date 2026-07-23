'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import type { Match, Team } from '@bleachers/types';
import { useMatchStats } from '@/lib/hooks';
import { Badge, LiveDot } from '@/components/ui/misc';

type MatchWithTeams = Match & { homeTeam: Team; awayTeam: Team };

/**
 * The signature surface: a frosted scorecard lit from behind by each team's
 * colour, with an oversized condensed score. Every match in the app is one of
 * these — the Apple-Sports "team-tinted glass" moment.
 */
export function MatchCard({ match }: { match: MatchWithTeams }) {
  const { data: stats } = useMatchStats(match.id);
  const score = stats?.score ?? [0, 0];
  const live = match.status === 'LIVE';
  const decided = match.status === 'COMPLETED';
  const href =
    live || match.status === 'SCHEDULED' ? `/matches/${match.id}/live` : `/matches/${match.id}`;

  const homeColor = (match.homeTeam.colors as { primary: string }).primary;
  const awayColor = (match.awayTeam.colors as { primary: string }).primary;
  // Dim the trailing side once a result exists so the eye lands on the winner.
  const homeLead = decided && score[0] > score[1];
  const awayLead = decided && score[1] > score[0];

  return (
    <Link href={href}>
      <motion.article
        whileTap={{ scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 500, damping: 32 }}
        className="glass rim relative overflow-hidden rounded-xl p-5"
      >
        {/* Team-coloured light bleeding up from behind the glass. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-28 opacity-40 blur-2xl"
          style={{
            background: `radial-gradient(60% 100% at 12% 100%, ${homeColor}, transparent 70%), radial-gradient(60% 100% at 88% 100%, ${awayColor}, transparent 70%)`,
          }}
        />

        <div className="relative">
          <div className="mb-4 flex items-center justify-between">
            {live ? (
              <Badge variant="live">
                <LiveDot /> Live
              </Badge>
            ) : (
              <Badge variant="muted">{match.status}</Badge>
            )}
            <span className="text-eyebrow text-ink-3">{match.statTier}</span>
          </div>

          <div className="space-y-2.5">
            <ScoreRow
              name={match.homeTeam.name}
              color={homeColor}
              value={score[0]}
              lead={homeLead}
              dim={decided && !homeLead}
            />
            <ScoreRow
              name={match.awayTeam.name}
              color={awayColor}
              value={score[1]}
              lead={awayLead}
              dim={decided && !awayLead}
            />
          </div>

          {match.venue && (
            <p className="text-ink-3 mt-4 truncate text-xs">{match.venue}</p>
          )}
        </div>
      </motion.article>
    </Link>
  );
}

function ScoreRow({
  name,
  color,
  value,
  lead,
  dim,
}: {
  name: string;
  color: string;
  value: number;
  lead: boolean;
  dim: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className="h-8 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
        />
        <span
          className={`truncate text-[15px] font-semibold ${dim ? 'text-ink-2' : 'text-ink-1'}`}
        >
          {name}
        </span>
        {lead && (
          <svg viewBox="0 0 8 10" className="text-ink-1 h-2.5 w-2.5 shrink-0" aria-hidden>
            <path d="M0 0l8 5-8 5z" fill="currentColor" />
          </svg>
        )}
      </div>
      <span
        className={`font-display tabnums text-score-sm shrink-0 leading-none ${
          dim ? 'text-ink-2' : 'text-ink-1'
        }`}
      >
        {value}
      </span>
    </div>
  );
}
