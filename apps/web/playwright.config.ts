import { defineConfig, devices } from '@playwright/test';

/**
 * E2E config. Starts the web dev server automatically; expects the API (:4000) and a seeded
 * database to be running (`pnpm db:up && pnpm db:migrate && pnpm db:seed && pnpm --filter
 * @bleachers/api dev`). The public-match and auth specs need no signed-in session. `wizard.spec.ts`
 * runs authenticated: the `setup` project (`tests-e2e/setup/auth.setup.ts`) creates a fresh
 * Supabase user via the admin API and writes its session into a storageState file that only the
 * `wizard` project consumes; `globalTeardown` deletes that user again once the run finishes.
 */
export default defineConfig({
  testDir: './tests-e2e',
  fullyParallel: true,
  // Generous per-test timeout: the local dev server compiles routes on first hit.
  timeout: 60_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  globalTeardown: './tests-e2e/setup/global-teardown.ts',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /wizard\.spec\.ts/,
    },
    {
      name: 'wizard',
      use: { ...devices['Desktop Chrome'], storageState: './tests-e2e/.auth/user.json' },
      dependencies: ['setup'],
      testMatch: /wizard\.spec\.ts/,
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
