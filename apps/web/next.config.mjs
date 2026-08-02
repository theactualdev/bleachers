// Stamped into the service worker's cache name so each deploy invalidates the
// previous shell. Resolved once per process — at build time in CI, at dev-server
// start locally — never per request, or the worker would reinstall in a loop.
const BUILD_ID = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? `local-${Date.now()}`;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: { BLEACHERS_BUILD_ID: BUILD_ID },
  transpilePackages: ['@bleachers/types', '@bleachers/sport-engine'],
  eslint: {
    // Lint is run explicitly in CI via `pnpm lint`; don't fail the build on it.
    ignoreDuringBuilds: true,
  },
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};

export default nextConfig;
