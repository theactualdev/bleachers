'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { CloudOff, RefreshCw } from 'lucide-react';
import { useConnectivity } from '@/lib/store';

/** A floating glass pill that appears when offline or while syncing queued events. */
export function ConnectivityBanner() {
  const { online, pending, syncing } = useConnectivity();
  // Only surface the banner when it's actionable — offline, or actually flushing
  // queued events. A background sync with nothing queued shouldn't flash a chip.
  const show = !online || pending > 0;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: -24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -24, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 32 }}
          className="fixed inset-x-0 top-3 z-30 mx-auto flex w-fit max-w-[92%] justify-center px-4"
        >
          <div className="glass-strong rim text-ink-1 flex items-center gap-2 rounded-pill px-4 py-2 text-xs font-medium">
            {!online ? (
              <>
                <CloudOff className="text-warning h-3.5 w-3.5" />
                Offline — {pending} event{pending === 1 ? '' : 's'} queued, syncing when you reconnect
              </>
            ) : (
              <>
                <RefreshCw className={`text-brand h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
                Syncing {pending} queued event{pending === 1 ? '' : 's'}…
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
