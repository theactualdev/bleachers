'use client';

import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

export interface AppSession {
  user: { id: string; email: string; name: string | null; image: string | null };
}

function toAppSession(session: Session | null): AppSession | null {
  if (!session) return null;
  const u = session.user;
  const meta = (u.user_metadata ?? {}) as {
    name?: string;
    full_name?: string;
    avatar_url?: string;
  };
  return {
    user: {
      id: u.id,
      email: u.email ?? '',
      name: meta.name ?? meta.full_name ?? null,
      image: meta.avatar_url ?? null,
    },
  };
}

/** Mirrors the previous Better Auth hook shape so consumers need no changes. */
export function useSession(): { data: AppSession | null; isPending: boolean } {
  const [data, setData] = useState<AppSession | null>(null);
  const [isPending, setIsPending] = useState(true);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return;
      setData(toAppSession(session));
      setIsPending(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setData(toAppSession(session));
      setIsPending(false);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { data, isPending };
}

export const signOut = () => supabase.auth.signOut();
