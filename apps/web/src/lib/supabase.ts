'use client';

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Browser Supabase client. Persists the session and parses magic-link/OAuth callbacks. */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

/**
 * Which social providers the project actually has configured.
 *
 * `signInWithOAuth` does not fail client-side for an unconfigured provider — it
 * redirects, and Supabase answers the authorize request with a raw JSON 400
 * ("provider is not enabled") that strands the user on a blank error page. So we
 * ask first and only offer buttons that will work.
 */
export async function fetchEnabledProviders(): Promise<Record<string, boolean>> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/settings`, {
    headers: { apikey: SUPABASE_ANON_KEY },
  });
  if (!res.ok) throw new Error(`Could not read auth settings (${res.status})`);
  const settings = (await res.json()) as { external?: Record<string, boolean> };
  return settings.external ?? {};
}
