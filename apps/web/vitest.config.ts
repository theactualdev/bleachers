import { defineConfig } from 'vitest/config';

// Unit tests only. Playwright E2E specs live in tests-e2e/ and run via `pnpm test:e2e`.
export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
});
