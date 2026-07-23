import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Creates a confirmed Supabase auth user; the DB trigger creates its profile. */
export async function createTestUser(): Promise<string> {
  const email = `test-${randomUUID()}@bleachers.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error) throw error;
  return data.user.id;
}

export async function deleteTestUser(id: string): Promise<void> {
  await admin.auth.admin.deleteUser(id);
}
