import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

loadEnv({ path: path.resolve(__dirname, '../../../api/.env') });

const META_FILE = path.resolve(__dirname, '../.auth/user-meta.json');

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

/** Deletes the fresh user `auth.setup.ts` created, so e2e runs don't accumulate auth users. */
export default async function globalTeardown() {
  if (!fs.existsSync(META_FILE)) return;
  const { id } = JSON.parse(fs.readFileSync(META_FILE, 'utf-8')) as { id: string; email: string };

  const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Best-effort: a platform-side deleteUser outage must not fail a green e2e run.
  // Orphaned *@bleachers.test users are swept by apps/api/scripts/cleanup-test-users.ts.
  try {
    await withRetry(async () => {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) throw error;
    });
  } catch (e) {
    console.warn(
      `e2e teardown: could not delete test user ${id} — leaving for the cleanup sweep.`,
      e instanceof Error ? e.message : e,
    );
  } finally {
    fs.rmSync(META_FILE, { force: true });
  }
}
