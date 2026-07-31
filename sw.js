/* ============================================================
   Hanbit service worker
   ------------------------------------------------------------
   The whole app is one HTML file with no external requests, so
   this is deliberately small. Its only jobs are:
     · make the app open instantly and work with no signal
     · pick up a new version without ever showing a broken page
   Strategy is stale-while-revalidate: serve the cached copy
   immediately and fetch a fresh one in the background. The page
   decides when to swap — it applies an update on its own as soon
   as you are idle, and holds off while you are mid-session so a
   reload can never eat the card you were halfway through. Study
   progress lives in localStorage and is never touched here.
   ============================================================ */

const VERSION = 'hanbit-v4';
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/av-jiwoo.webp',
  './icons/av-minseo.webp',
  './icons/av-minsu.webp'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(VERSION)
      // addAll is all-or-nothing; a single missing icon must not stop the
      // app itself from being cached, so each entry is allowed to fail.
      .then(c => Promise.all(CORE.map(u => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => {
  if (e.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: cached shell first so the app opens with no signal,
  // with a background refresh for next time.
  if (req.mode === 'navigate') {
    e.respondWith(
      caches.match('./index.html').then(hit => {
        const net = fetch(req).then(res => {
          if (res && res.ok) caches.open(VERSION).then(c => c.put('./index.html', res.clone()));
          return res;
        }).catch(() => hit);
        return hit || net;
      })
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(hit => {
      const net = fetch(req).then(res => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
