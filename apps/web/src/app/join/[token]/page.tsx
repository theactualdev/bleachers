'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import type { OrgRole } from '@bleachers/types';
import { API_URL } from '@/lib/api-url';
import { apiPost, ApiError } from '@/lib/api';
import { useSession } from '@/lib/auth-client';
import { useOrgStore } from '@/lib/org-store';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Logo } from '@/components/ui/logo';
import { Skeleton, Spinner } from '@/components/ui/misc';

type Preview = { valid: false } | { valid: true; orgName: string; role: OrgRole };
type AcceptResult = { orgId: string; role: OrgRole; alreadyMember: boolean };

function JoinScreen({ token }: { token: string }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const { data: session, isPending } = useSession();
  const setActiveOrg = useOrgStore((s) => s.setActiveOrg);
  const qc = useQueryClient();
  const router = useRouter();

  useEffect(() => {
    let active = true;
    fetch(`${API_URL}/api/invites/${token}`)
      .then((res) => res.json())
      .then((data: Preview) => {
        if (active) setPreview(data);
      })
      .catch(() => {
        if (active) setPreview({ valid: false });
      });
    return () => {
      active = false;
    };
  }, [token]);

  async function join() {
    setJoining(true);
    setError('');
    try {
      const result = await apiPost<AcceptResult>(`/api/invites/${token}/accept`);
      setActiveOrg(result.orgId);
      await qc.invalidateQueries({ queryKey: ['me'] });
      router.replace('/');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not join this organization');
      setJoining(false);
    }
  }

  const loading = preview === null || isPending;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
      <div className="text-center">
        <Logo size={64} className="mx-auto mb-4" priority />
        <h1 className="font-display text-ink-1 text-3xl font-bold uppercase tracking-tight">
          Bleachers
        </h1>
      </div>

      <Card className="w-full max-w-sm">
        <CardContent className="space-y-4 pt-6">
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="mx-auto h-4 w-2/3" />
              <Skeleton className="mx-auto h-7 w-4/5" />
              <Skeleton className="h-11 w-full" />
            </div>
          ) : !preview.valid ? (
            <p className="text-ink-1 py-4 text-center font-semibold">
              This invite link is no longer valid
            </p>
          ) : !session ? (
            <>
              <div className="text-center">
                <p className="text-ink-2 text-sm">You&rsquo;ve been invited to join</p>
                <p className="font-display text-ink-1 text-2xl font-bold tracking-tight">
                  {preview.orgName}
                </p>
                <p className="text-ink-3 text-eyebrow mt-1">{preview.role.toLowerCase()}</p>
              </div>
              <Link href={`/login?next=${encodeURIComponent(`/join/${token}`)}`}>
                <Button className="w-full">Sign in to join</Button>
              </Link>
            </>
          ) : (
            <>
              <div className="text-center">
                <p className="text-ink-2 text-sm">You&rsquo;ve been invited to join</p>
                <p className="font-display text-ink-1 text-2xl font-bold tracking-tight">
                  {preview.orgName}
                </p>
              </div>
              {error && <p className="text-negative text-center text-sm">{error}</p>}
              <Button className="w-full" onClick={join} disabled={joining}>
                {joining && <Spinner />}
                Join {preview.orgName} as {preview.role.toLowerCase()}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  return <JoinScreen token={token} />;
}
