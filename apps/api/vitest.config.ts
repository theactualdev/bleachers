import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC compiles decorators WITH metadata, which NestJS DI requires — plain esbuild does not.
export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    globals: true,
    environment: 'node',
    root: '.',
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  plugins: [swc.vite()],
});
