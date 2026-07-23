'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/auth-client';
import { Spinner } from '@/components/ui/misc';

/** Client-side guard for app pages. Redirects to /login when there is no session. */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { data, isPending } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!isPending && !data) router.replace('/login');
  }, [isPending, data, router]);

  if (isPending) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner className="text-muted-foreground h-6 w-6" />
      </div>
    );
  }
  if (!data) return null;
  return <>{children}</>;
}
