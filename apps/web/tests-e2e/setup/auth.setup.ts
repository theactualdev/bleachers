import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test as setup } from '@playwright/test';
import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Admin creds (service role key) live in the API's env; the anon key + project URL the browser
// client actually uses live in the web app's env. Load both without clobbering either.
loadEnv({ path: path.resolve(__dirname, '../../../api/.env') });
loadEnv({ path: path.resolve(__dirname, '../../.env') });

const AUTH_DIR = path.resolve(__dirname, '../.auth');
export const STATE_FILE = path.join(AUTH_DIR, 'user.json');
export const META_FILE = path.join(AUTH_DIR, 'user-meta.json');

/**
 * The hosted auth admin API can return transient errors — mirrors
 * `apps/api/test/helpers/auth.ts`'s `withRetry` so e2e setup is just as resilient.
 */
async function withRetry<T>(fn: () => Promise<T>, attempts = 6): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      await new Promise((r) => setTimeout(r, 300 * (i + 1) + Math.random() * 300));
    }
  }
  throw lastError;
}

setup('authenticate as a fresh e2e user', async () => {
  const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const email = `e2e-wizard-${randomUUID()}@bleachers.test`;

  // Confirmed user — the DB signup trigger creates its personal org, so the wizard sees a
  // zero-team, single-org account with no manual seeding.
  const user = await withRetry(async () => {
    const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
    if (error) throw error;
    return data.user;
  });

  const link = await withRetry(async () => {
    const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
    if (error) throw error;
    return data;
  });

  const session = await withRetry(async () => {
    const { data, error } = await anon.auth.verifyOtp({
      type: 'magiclink',
      token_hash: link.properties.hashed_token,
    });
    if (error) throw error;
    if (!data.session) throw new Error('verifyOtp did not return a session');
    return data.session;
  });

  // `@supabase/supabase-js` persists sessions under `sb-<project-ref>-auth-token`; the ref is the
  // subdomain of the project URL.
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0];

  fs.mkdirSync(AUTH_DIR, { recursive: true });
  fs.writeFileSync(
    STATE_FILE,
    JSON.stringify({
      cookies: [],
      origins: [
        {
          origin: 'http://localhost:3000',
          localStorage: [{ name: `sb-${ref}-auth-token`, value: JSON.stringify(session) }],
        },
      ],
    }),
  );
  // Kept alongside the storageState so the teardown project can delete this exact user without
  // re-deriving anything from the session token.
  fs.writeFileSync(META_FILE, JSON.stringify({ id: user.id, email }));
});
