import { expect, test } from '@playwright/test';

test('unauthenticated users are redirected to login', async ({ page }) => {
  await page.goto('/');
  await page.waitForURL('**/login');
  await expect(page.getByRole('heading', { name: 'Bleachers' })).toBeVisible();
  await expect(page.getByPlaceholder('you@example.com')).toBeVisible();
  await expect(page.getByRole('button', { name: /sign-in code/i })).toBeVisible();
});

test('an unknown address is refused and pointed at the waitlist', async ({ page }) => {
  await page.goto('/login');

  // Unique per run so it cannot collide with a user left behind by an earlier
  // run — back when signups were open this address would have been created on
  // the spot, and the assertion below would then be testing nothing.
  await page.getByPlaceholder('you@example.com').fill(`e2e-${Date.now()}@bleachers.test`);
  await page.getByRole('button', { name: /sign-in code/i }).click();

  // Pre-launch, the sign-in form must never mint an account: `shouldCreateUser:
  // false` here, and "allow new users to sign up" off in Supabase. An unknown
  // address gets the waitlist, not a code.
  await expect(page.getByText(/open to new accounts yet/i)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('link', { name: /join the waitlist/i })).toBeVisible();
  await expect(page.getByText('Check your email')).toBeHidden();
});

test('the waitlist page is public and takes an email', async ({ page }) => {
  await page.goto('/waitlist');
  await expect(page.getByRole('heading', { name: 'Bleachers' })).toBeVisible();
  await expect(page.getByPlaceholder('you@example.com')).toBeVisible();
  await expect(page.getByRole('button', { name: /join the waitlist/i })).toBeVisible();
  // Submitting is deliberately not exercised: it would write a real signup and
  // send a real email on every CI run.
});
