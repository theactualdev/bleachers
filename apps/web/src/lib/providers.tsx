'use client';

import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { flushQueue, queueSize } from './offline/queue';
import { useConnectivity } from './store';

/**
 * App-wide providers: React Query, service-worker registration, and the background sync loop
 * that drains the offline event queue whenever connectivity returns.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 10_000, retry: 1, refetchOnWindowFocus: false },
        },
      }),
  );
  const { setOnline, setPending, setSyncing } = useConnectivity();

  useEffect(() => {
    // Register the service worker for offline app-shell + installability.
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* PWA is progressive — ignore registration failures. */
      });
    }

    async function sync() {
      if (!navigator.onLine) return;
      setSyncing(true);
      const reconciled = await flushQueue();
      setSyncing(false);
      if (reconciled > 0) {
        setPending(await queueSize());
        // Nudge queries to refetch fresh derived stats after a sync.
        client.invalidateQueries();
      }
    }

    async function refreshPending() {
      setPending(await queueSize());
    }

    const onOnline = () => {
      setOnline(true);
      void sync();
    };
    const onOffline = () => setOnline(false);

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    void refreshPending();
    void sync();
    const interval = setInterval(sync, 15_000);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      clearInterval(interval);
    };
  }, [client, setOnline, setPending, setSyncing]);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
