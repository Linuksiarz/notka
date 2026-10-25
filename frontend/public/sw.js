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
 *   - A navigation asks the network first, so an app started while online is the build the server
 *     has now — answering from the cache first left the installed app on an old build until its
 *     storage was cleared. Offline, or when the server has not answered within
 *     `NAVIGATION_TIMEOUT_MS`, the cached shell answers. The page's chunks are named by their content,
 *     so a fresh page brings its own (a cache miss goes to the network).
 *   - What the worker stores is revalidated with the server (`cache: 'no-cache'`): the server sends
 *     no `Cache-Control` for its static files, and a copy the HTTP cache kept heuristically would
 *     otherwise be taken for the fresh one.
 *   - Everything else same-origin is stale-while-revalidate.
 *   - A share from another app (the manifest's `share_target`) is a `POST /share` no server
 *     answers: the worker keeps what was shared in the share inbox and sends the app to `/share`,
 *     which reads it from there (`control/api/shareInbox.ts`) — with or without a connection.
 */

const CACHE_VERSION = 'notka-v1';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const ASSET_CACHE = `${CACHE_VERSION}-assets`;

/** The share inbox; its name and keys are the app's `control/api/shareInbox.ts`. */
const SHARE_CACHE = `${CACHE_VERSION}-share`;

const SHELL_URLS = ['/', '/theme.js', '/manifest.webmanifest', '/favicon.svg', '/icons/icon-192.png'];

/** How long a navigation waits for the server before the cached shell answers (a weak connection). */
const NAVIGATION_TIMEOUT_MS = 3000;

const fresh = (url) => new Request(url, { cache: 'no-cache' });

self.addEventListener('install', (event) => {
  event.waitUntil(precacheShell().then(() => self.skipWaiting()));
});

/**
 * Every chunk the build made — the page's own script and stylesheet, the editor and the zip library
 * it loads later, and the fonts — from the build's manifest (`build.manifest` in `vite.config.ts`),
 * rather than a list every build would invalidate. `.woff` is left out: it is the fallback for
 * browsers too old to run a service worker in the first place. So is the JPEG XL codec (`@jsquash`,
 * megabytes of WebAssembly): it only encodes an avatar being uploaded, which never happens offline.
 */
async function precacheShell() {
  const shell = await caches.open(SHELL_CACHE);
  await shell.addAll(SHELL_URLS.map(fresh));
  const manifest = await (await fetch(fresh('/.vite/manifest.json'))).json();
  const files = new Set();
  for (const [source, chunk] of Object.entries(manifest)) {
    if (source.includes('@jsquash')) continue;
    for (const file of [chunk.file, ...(chunk.css ?? [])]) {
      if (file && !file.endsWith('.woff')) files.add(`/${file}`);
    }
  }
  await (await caches.open(ASSET_CACHE)).addAll([...files].map(fresh));
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
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.method === 'POST' && url.pathname === '/share') {
    event.respondWith(receiveShare(request));
    return;
  }
  if (request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

/**
 * Keeps one share — the latest — as a JSON entry plus one entry per picture, then answers with a
 * redirect, so a reload of the page that opens is a plain GET and does not share it again.
 */
async function receiveShare(request) {
  const form = await request.formData();
  const files = form.getAll('images').filter((value) => value instanceof File && value.size > 0);
  const inbox = await caches.open(SHARE_CACHE);
  for (const key of await inbox.keys()) await inbox.delete(key);
  await Promise.all(
    files.map((file, index) =>
      inbox.put(`/share-inbox/image/${index}`, new Response(file, { headers: { 'Content-Type': file.type } }))
    )
  );
  const text = (name) => (typeof form.get(name) === 'string' ? form.get(name) : '');
  const shared = { title: text('title'), text: text('text'), url: text('url'), images: files.length };
  await inbox.put('/share-inbox/content', new Response(JSON.stringify(shared), { headers: { 'Content-Type': 'application/json' } }));
  return Response.redirect('/share', 303);
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match('/');
  if (cached && !navigator.onLine) return cached;
  const network = fetch(request, { cache: 'no-cache' }).then((response) => {
    if (response.ok) cache.put('/', response.clone());
    return response;
  });
  if (!cached) return network.catch(() => Response.error());
  const late = new Promise((resolve) => setTimeout(() => resolve(cached), NAVIGATION_TIMEOUT_MS));
  return Promise.race([network.then((response) => (response.ok ? response : cached)).catch(() => cached), late]);
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
