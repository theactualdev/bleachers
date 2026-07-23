'use client';

import { motion } from 'framer-motion';
import { LiveDot } from '@/components/ui/misc';

export function Scoreboard({
  homeName,
  awayName,
  homeColor,
  awayColor,
  score,
  clockLabel,
  periodLabel,
  live = true,
}: {
  homeName: string;
  awayName: string;
  homeColor: string;
  awayColor: string;
  score: [number, number];
  clockLabel: string;
  periodLabel: string;
  live?: boolean;
}) {
  return (
    <div className="glass rim relative overflow-hidden rounded-xl p-5">
      {/* Team-coloured light bleeding up from behind the glass. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-32 opacity-40 blur-2xl"
        style={{
          background: `radial-gradient(60% 100% at 12% 100%, ${homeColor}, transparent 70%), radial-gradient(60% 100% at 88% 100%, ${awayColor}, transparent 70%)`,
        }}
      />
      <div className="relative">
        <div className="text-ink-3 mb-3 flex items-center justify-center gap-2">
          {live && <LiveDot />}
          <span className="text-eyebrow">
            {periodLabel} · {clockLabel}
          </span>
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <TeamBlock name={homeName} color={homeColor} align="left" />
          <div className="font-display tabnums text-ink-1 text-score flex items-center gap-2.5 leading-none">
            <motion.span key={score[0]} initial={{ scale: 1.3 }} animate={{ scale: 1 }}>
              {score[0]}
            </motion.span>
            <span className="text-ink-3 text-4xl">·</span>
            <motion.span key={score[1] + 1000} initial={{ scale: 1.3 }} animate={{ scale: 1 }}>
              {score[1]}
            </motion.span>
          </div>
          <TeamBlock name={awayName} color={awayColor} align="right" />
        </div>
      </div>
    </div>
  );
}

function TeamBlock({
  name,
  color,
  align,
}: {
  name: string;
  color: string;
  align: 'left' | 'right';
}) {
  return (
    <div className={`flex items-center gap-2.5 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
      <span className="h-7 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span
        className={`text-ink-1 truncate text-sm font-semibold ${align === 'right' ? 'text-right' : ''}`}
      >
        {name}
      </span>
    </div>
  );
}
