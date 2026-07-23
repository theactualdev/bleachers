import { CloudOff } from 'lucide-react';

export default function OfflinePage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="glass rim flex h-16 w-16 items-center justify-center rounded-2xl">
        <CloudOff className="text-warning h-7 w-7" />
      </div>
      <div>
        <h1 className="font-display text-ink-1 text-3xl font-bold uppercase tracking-tight">
          You&apos;re offline
        </h1>
        <p className="text-ink-2 mx-auto mt-2 max-w-xs text-sm">
          Bleachers keeps working — any events you record are queued and sync automatically when you
          reconnect.
        </p>
      </div>
    </div>
  );
}
