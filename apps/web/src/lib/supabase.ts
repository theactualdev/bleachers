'use client';

import { createClient } from '@supabase/supabase-js';

/** Browser Supabase client. Persists the session and parses magic-link/OAuth callbacks. */
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } },
);
