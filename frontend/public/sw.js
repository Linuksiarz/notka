/*
 * Notka service worker.
 *
 * Hand-written on purpose: the app shell is tiny and the caching rules are simple, so a
 * precache-manifest plugin would be more moving parts than value.
 *
 * Rules:
 *   - API requests are never cached here. The app keeps its own copy of the notes (IndexedDB,
 *     `control/api/localStore.ts`), because only the app knows which account they belong to and when
 *     they are stale.
 *   - The shell — the page, every chunk of its script and stylesheet, and the fonts — is cached when
 *     the worker installs, so the installed app opens without a connection from the first time on.
 *   - Navigations are network-first so a redeployed build is picked up immediately, with the
 *     cached shell as the offline fallback (this is also what makes client-side routes work).
 *   - Everything else same-origin is stale-while-revalidate.
 */

const CACHE_VERSION = 'notka-v1';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const ASSET_CACHE = `${CACHE_VERSION}-assets`;

const SHELL_URLS = ['/', '/theme.js', '/manifest.webmanifest', '/favicon.svg', '/icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(precacheShell().then(() => self.skipWaiting()));
});

/**
 * Every chunk the build made — the page's own script and stylesheet, the editor and the zip library
 * it loads later, and the fonts — from the build's manifest (`build.manifest` in `vite.config.ts`),
 * rather than a list every build would invalidate. `.woff` is left out: it is the fallback for
 * browsers too old to run a service worker in the first place.
 */
async function precacheShell() {
  const shell = await caches.open(SHELL_CACHE);
  await shell.addAll(SHELL_URLS);
  const manifest = await (await fetch('/.vite/manifest.json')).json();
  const files = new Set();
  for (const chunk of Object.values(manifest)) {
    for (const file of [chunk.file, ...(chunk.css ?? [])]) {
      if (file && !file.endsWith('.woff')) files.add(`/${file}`);
    }
  }
  await (await caches.open(ASSET_CACHE)).addAll([...files]);
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => !key.startsWith(CACHE_VERSION)).map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

async function networkFirstNavigation(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put('/', response.clone());
    return response;
  } catch {
    const cached = await cache.match('/');
    return cached ?? Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached ?? Response.error());

  return cached ?? network;
}
