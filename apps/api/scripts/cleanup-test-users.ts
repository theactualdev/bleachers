import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PATTERNS = [/@bleachers\.test$/i, /^e2e@bleachers\.app$/i];

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

async function main() {
  // Paginate defensively even though the project is small.
  let page = 1;
  const targets: { id: string; email: string }[] = [];
  for (;;) {
    const { data, error } = await withRetry(() =>
      admin.auth.admin.listUsers({ page, perPage: 100 }),
    );
    if (error) throw error;
    for (const u of data.users) {
      const email = u.email ?? '';
      if (PATTERNS.some((p) => p.test(email))) targets.push({ id: u.id, email });
    }
    if (data.users.length < 100) break;
    page++;
  }
  console.log(`Deleting ${targets.length} orphaned test users…`);
  for (const t of targets) {
    await withRetry(async () => {
      const { error } = await admin.auth.admin.deleteUser(t.id);
      if (error) throw error;
    });
    console.log(`  deleted ${t.email}`);
  }
  console.log('✅ cleanup complete');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
