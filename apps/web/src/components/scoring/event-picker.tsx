'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import type { SportConfig } from '@bleachers/sport-engine';
import { getButtonGroups } from '@bleachers/sport-engine';
import type { StatTier } from '@bleachers/types';
import { cn } from '@/lib/utils';

const intentClass: Record<string, string> = {
  positive: 'border-live/30 bg-live/10 text-ink-1',
  negative: 'border-negative/30 bg-negative/10 text-ink-1',
  neutral: 'border-hairline bg-glass text-ink-1',
};

/** Bottom-sheet event picker — the second tap. Renders buttons purely from the sport config. */
export function EventPicker({
  config,
  tier,
  subtitle,
  open,
  onPick,
  onClose,
}: {
  config: SportConfig;
  tier: StatTier;
  subtitle: string;
  open: boolean;
  onPick: (eventTypeId: string) => void;
  onClose: () => void;
}) {
  const groups = getButtonGroups(config, tier);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="glass-strong rim fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[82dvh] max-w-2xl overflow-y-auto rounded-t-3xl p-5 pb-[max(2rem,env(safe-area-inset-bottom))]"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 320 }}
          >
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-white/20" />
            <div className="mb-4 flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-eyebrow text-ink-3">Record event</p>
                <p className="text-ink-1 truncate text-lg font-semibold">{subtitle}</p>
              </div>
              <button
                onClick={onClose}
                className="text-ink-2 hover:bg-glass hover:text-ink-1 -mr-1 shrink-0 rounded-full p-2 transition-colors"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-5">
              {groups.map((group) => (
                <div key={group.id}>
                  <p className="text-eyebrow text-ink-3 mb-2">{group.label}</p>
                  <div className="grid grid-cols-2 gap-2.5">
                    {group.buttons.map((et) => (
                      <button
                        key={et.id}
                        onClick={() => onPick(et.id)}
                        className={cn(
                          'ease-spring flex h-14 items-center justify-center rounded-md border px-3 text-center text-sm font-semibold transition-all duration-200 active:scale-95',
                          intentClass[et.intent] ?? intentClass.neutral,
                        )}
                      >
                        {et.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
