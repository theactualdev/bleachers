'use client';

import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Failed-load state: never render blankness when a query errors. */
export function QueryErrorState({
  what,
  error,
  onRetry,
}: {
  what: string;
  error?: unknown;
  onRetry: () => void;
}) {
  const reason = error instanceof Error && error.message ? error.message : null;
  return (
    <div className="glass rim relative overflow-hidden rounded-xl px-6 py-10 text-center">
      <p className="font-display text-ink-1 text-2xl font-bold tracking-tight">
        Couldn&apos;t load {what}
      </p>
      {reason && <p className="text-ink-3 mx-auto mt-1 max-w-xs text-sm">{reason}</p>}
      <Button variant="glass" className="mt-5" onClick={onRetry}>
        <RotateCcw className="h-4 w-4" /> Retry
      </Button>
    </div>
  );
}
