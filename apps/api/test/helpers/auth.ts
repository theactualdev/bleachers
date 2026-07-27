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

/**
 * Best-effort cleanup: the hosted admin deleteUser endpoint has shown sustained
 * outages that would otherwise fail whole suites from `afterAll` even when every
 * test passed. Assertions live in tests; orphaned `*@bleachers.test` users are
 * hygiene, swept by `scripts/cleanup-test-users.ts` — so never throw from here.
 */
export async function deleteTestUser(id: string): Promise<void> {
  if (!id) return;
  try {
    await withRetry(async () => {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) throw error;
    });
  } catch (e) {
    console.warn(
      `deleteTestUser: could not delete ${id} (platform issue?) — leaving for the cleanup sweep.`,
      e instanceof Error ? e.message : e,
    );
  }
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
