import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { PrismaClient } from '@prisma/client';

const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * The hosted auth admin API can return transient errors — including sustained ~50%
 * failure when one auth replica has a stale key cache after signing-key changes
 * (observed live: "unrecognized JWT kid <nil> for algorithm ES256"). Retry with
 * backoff + jitter so integration runs stay stable while the platform misbehaves.
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

/** Creates a confirmed Supabase auth user; the DB trigger creates its profile. */
export async function createTestUser(): Promise<string> {
  return withRetry(async () => {
    const email = `test-${randomUUID()}@bleachers.test`;
    const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
    if (error) throw error;
    return data.user.id;
  });
}

export async function deleteTestUser(id: string): Promise<void> {
  if (!id) return;
  await withRetry(async () => {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw error;
  });
}

const prismaForHelpers = new PrismaClient();

/** The personal org auto-created for a test user by the signup trigger. */
export async function getPersonalOrg(userId: string): Promise<string> {
  const m = await prismaForHelpers.orgMembership.findFirst({
    where: { userId, org: { isPersonal: true } },
    select: { orgId: true },
  });
  if (!m) throw new Error(`No personal org for user ${userId} — signup trigger broken?`);
  return m.orgId;
}
