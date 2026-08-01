import { expect, test } from '@playwright/test';

test('unauthenticated users are redirected to login', async ({ page }) => {
  await page.goto('/');
  await page.waitForURL('**/login');
  await expect(page.getByRole('heading', { name: 'Bleachers' })).toBeVisible();
  await expect(page.getByPlaceholder('you@example.com')).toBeVisible();
  await expect(page.getByRole('button', { name: /sign-in code/i })).toBeVisible();
});

test('login form accepts an email and asks for the code', async ({ page }) => {
  await page.goto('/login');
  await page.getByPlaceholder('you@example.com').fill('e2e@bleachers.app');
  await page.getByRole('button', { name: /sign-in code/i }).click();
  // Supabase accepts the OTP request; the email is delivered via configured SMTP.
  await expect(page.getByText('Check your email')).toBeVisible({ timeout: 30_000 });
  // The code is entered in the app itself — this is what keeps sign-in working
  // inside an installed PWA, where the emailed link would open a browser instead.
  await expect(page.getByLabel('Sign-in code')).toBeVisible();
});
