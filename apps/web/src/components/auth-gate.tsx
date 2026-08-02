'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/auth-client';
import { useMe } from '@/lib/hooks';
import { useActiveOrgId } from '@/lib/org-store';
import { Spinner } from '@/components/ui/misc';
import { QueryErrorState } from '@/components/ui/query-error';

/** Branded hold screen — signing in should never look like a blank app. */
function Loading({ label }: { label: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6">
      <div className="bg-brand text-brand-ink font-display shadow-button flex h-14 w-14 items-center justify-center rounded-2xl text-3xl font-extrabold">
        B
      </div>
      <div className="text-ink-3 flex items-center gap-2 text-sm">
        <Spinner />
        {label}
      </div>
    </div>
  );
}

/**
 * Client-side guard for app pages. Redirects to /login when there is no session,
 * and holds until the active organization is resolved.
 *
 * That second part matters: every org-scoped query is `enabled: !!orgId`, and a
 * disabled query reports `isLoading: false` with no data — so without this gate
 * screens race past their own loading states and render as blank.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { data, isPending } = useSession();
  const router = useRouter();
  const { data: me, isError: meFailed, error: meError, refetch } = useMe();
  const activeOrgId = useActiveOrgId();

  useEffect(() => {
    if (!isPending && !data) router.replace('/login');
  }, [isPending, data, router]);

  if (isPending) return <Loading label="Getting things ready…" />;
  if (!data) return null;

  if (meFailed) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <QueryErrorState what="your account" error={meError} onRetry={() => refetch()} />
      </div>
    );
  }

  if (me && me.memberships.length === 0) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <QueryErrorState
          what="your organization"
          error={new Error('This account has no organization yet.')}
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  if (!activeOrgId) return <Loading label="Loading your matches…" />;

  return <>{children}</>;
}
