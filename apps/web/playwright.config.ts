import { defineConfig, devices } from '@playwright/test';

/**
 * E2E config. Starts the web dev server automatically; expects the API (:4000) and a seeded
 * database to be running (`pnpm db:up && pnpm db:migrate && pnpm db:seed && pnpm --filter
 * @bleachers/api dev`). The public-match spec needs no auth; the scoring spec signs in via the
 * dev magic-link that the API prints to its console.
 */
export default defineConfig({
  testDir: './tests-e2e',
  fullyParallel: true,
  // Generous per-test timeout: the local dev server compiles routes on first hit.
  timeout: 60_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
