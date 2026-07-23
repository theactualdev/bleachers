import { expect, test } from '@playwright/test';

test('unauthenticated users are redirected to login', async ({ page }) => {
  await page.goto('/');
  await page.waitForURL('**/login');
  await expect(page.getByRole('heading', { name: 'Bleachers' })).toBeVisible();
  await expect(page.getByPlaceholder('you@example.com')).toBeVisible();
  await expect(page.getByRole('button', { name: /magic link/i })).toBeVisible();
});

test('login form accepts an email and shows the sent state', async ({ page }) => {
  await page.goto('/login');
  await page.getByPlaceholder('you@example.com').fill('e2e@bleachers.app');
  await page.getByRole('button', { name: /magic link/i }).click();
  // The API accepts the request; the dev magic link is printed to the API console.
  await expect(page.getByText('Check your email')).toBeVisible({ timeout: 30_000 });
});
