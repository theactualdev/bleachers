'use client';

import { AnimatePresence, motion } from 'framer-motion';
import type { ChainPrompt } from '@bleachers/sport-engine';
import { Button } from '@/components/ui/button';

export interface ChainPlayer {
  playerId: string;
  name: string;
  jersey: string | null;
}

/** The optional chained follow-up (e.g. Goal → "Who assisted?"). Fully config-driven. */
export function ChainDialog({
  prompt,
  players,
  onAnswer,
  onSkip,
}: {
  prompt: ChainPrompt | null;
  players: ChainPlayer[];
  onAnswer: (playerId: string) => void;
  onSkip: () => void;
}) {
  return (
    <AnimatePresence>
      {prompt && (
        <>
          <motion.div
            className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onSkip}
          />
          <motion.div
            className="glass-strong rim fixed inset-x-0 bottom-0 z-[70] mx-auto max-h-[72dvh] max-w-2xl overflow-y-auto rounded-t-3xl p-5 pb-[max(2rem,env(safe-area-inset-bottom))]"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 320 }}
          >
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-white/20" />
            <p className="text-ink-1 mb-4 text-center text-lg font-semibold">{prompt.title}</p>
            <div className="grid grid-cols-3 gap-2.5">
              {players.map((p) => (
                <button
                  key={p.playerId}
                  onClick={() => onAnswer(p.playerId)}
                  className="glass ease-spring text-ink-1 flex h-[4.5rem] flex-col items-center justify-center gap-0.5 rounded-md px-2 text-center text-xs font-medium transition-all duration-200 active:scale-95"
                >
                  {p.jersey && <span className="font-display text-xl font-bold">{p.jersey}</span>}
                  <span className="line-clamp-2 leading-tight">{p.name}</span>
                </button>
              ))}
            </div>
            {prompt.optional && (
              <Button variant="ghost" className="mt-4 w-full" onClick={onSkip}>
                Skip
              </Button>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
