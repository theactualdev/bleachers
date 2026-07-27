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
    // The integration specs all talk to one hosted Supabase project. Running the
    // files in parallel opened a Prisma pool per file and tripped pooler limits
    // ("Can't reach database server"), so run them one at a time.
    fileParallelism: false,
    // The hosted platform has intermittent auth/DB blips; one retry keeps a green
    // suite green without masking real, reproducible failures.
    retry: 2,
  },
  plugins: [swc.vite()],
});
