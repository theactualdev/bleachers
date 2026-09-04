'use client';

import { useEffect, useState } from 'react';

/** LIVE or PAUSED — the states where clocks tick and surfaces poll. */
export function isInPlay(status: string): boolean {
  return status === 'LIVE' || status === 'PAUSED';
}

/**
 * Epoch-ms "now" that re-renders once a second while `active`. Display-only:
 * elapsed time is always re-derived from server timestamps against this, so a
 * throttled or resumed tab snaps to the correct value on the next tick.
 */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}
