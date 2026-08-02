/**
 * The service worker is served from a route rather than `public/` so its bytes
 * change every deploy.
 *
 * Browsers byte-compare the worker script to decide whether to update. A static
 * `public/sw.js` is identical every build, so the update never fires, `activate`
 * never runs, and the stale-cache purge below never executes — stable-named
 * assets (icons, the manifest) would then be served from cache forever.
 * Stamping the build into the cache name fixes both halves.
 */

export const dynamic = 'force-static';

// Resolved once in next.config.mjs (commit SHA on Vercel, build timestamp
// otherwise) rather than here — a value computed per request would hand the
// browser a different script every check and loop the install forever.
const BUILD_ID = process.env.BLEACHERS_BUILD_ID ?? 'dev';

const source = /* js */ `
// Bleachers service worker — app-shell caching for offline + installability.
// Event writes are NOT handled here; they go through the IndexedDB queue in the app, which is the
// durable, idempotent source of truth for offline scoring.

const CACHE = 'bleachers-shell-${BUILD_ID}';
const SHELL = ['/', '/offline'];

self.addEventListener('install', (event) => {
  // Deliberately no skipWaiting(): a new worker activating mid-session would
  // purge the caches the running page is still loading chunks from. Waiting
  // until every tab is closed means an update can never break a live match.
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Never cache API or auth calls — they must hit the network (and fail loudly when offline).
  if (url.pathname.startsWith('/api') || url.hostname !== self.location.hostname) return;

  // Network-first for navigations so users get fresh pages, falling back to the cached shell.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request).then((r) => r || caches.match('/'))),
    );
    return;
  }

  // Cache-first for static assets.
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
});
`.trimStart();

export function GET() {
  return new Response(source, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Service-Worker-Allowed': '/',
    },
  });
}
