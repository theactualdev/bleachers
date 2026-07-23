import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Badge({
  className,
  variant = 'default',
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  variant?: 'default' | 'live' | 'success' | 'destructive' | 'muted' | 'outline';
}) {
  const variants: Record<string, string> = {
    default: 'bg-glass-strong text-ink-1 border border-hairline',
    live: 'text-live border border-live/30 bg-live/10',
    success: 'text-live border border-live/30 bg-live/10',
    destructive: 'text-negative border border-negative/30 bg-negative/10',
    muted: 'text-ink-2 border border-hairline bg-glass',
    outline: 'text-ink-2 border border-hairline',
  };
  return (
    <span
      className={cn(
        'text-eyebrow inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 uppercase',
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

/** Breathing live dot — used inside a LIVE badge. */
export function LiveDot() {
  return (
    <span className="relative flex h-1.5 w-1.5">
      <span className="animate-breathe absolute inline-flex h-full w-full rounded-full bg-live" />
      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-live" />
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('text-ink-3 h-4 w-4 animate-spin', className)} />;
}

/** Shimmering glass placeholder for loading states. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('glass relative overflow-hidden rounded-lg', className)}>
      <div className="animate-shimmer absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="glass rim relative overflow-hidden rounded-xl px-6 py-14 text-center">
      <p className="font-display text-ink-1 text-3xl font-bold tracking-tight">{title}</p>
      {hint && <p className="text-ink-2 mx-auto mt-2 max-w-xs text-sm">{hint}</p>}
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  );
}
