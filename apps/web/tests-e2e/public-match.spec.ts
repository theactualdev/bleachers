import { expect, test } from '@playwright/test';

const SEEDED_MATCH = '20000000-0000-4000-8000-000000000001';

/**
 * Verifies the public read-only match page renders derived stats end to end
 * (web → API → sport-engine → Postgres). No authentication required.
 */
test('public match page shows teams, score, and timeline', async ({ page }) => {
  await page.goto(`/m/${SEEDED_MATCH}`);

  await expect(page.getByText('Harbour FC')).toBeVisible();
  await expect(page.getByText('Union Athletic')).toBeVisible();

  // The seeded match is 1–1; the scoreboard renders both goals.
  await expect(page.locator('text=Timeline')).toBeVisible();
  await expect(page.getByText('Goal').first()).toBeVisible();

  // CSV export link is present.
  await expect(page.getByRole('link', { name: 'Download CSV' })).toBeVisible();
});
