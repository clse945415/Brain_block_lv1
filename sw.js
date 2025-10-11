const CACHE_NAME = 'brainblock-v1';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './main.js',
  './manifest.webmanifest',

  // game data
  './data/config.json',
  './data/levels.json',
  './data/puzzles.json',

  // icons
  './public/app-icon/app_icon.png'
];

// install: cache & activate new SW immediately
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
});

// activate: cleanup old caches and control pages
self.addEventListener('activate', e => {
  e.waitUntil(
    Promise.all([
      caches.keys().then(keys =>
        Promise.all(keys.map(k => (k === CACHE_NAME ? null : caches.delete(k))))
      ),
      self.clients.claim()
    ])
  );
});

// network-first with cache fallback
self.addEventListener('fetch', e => {
  const req = e.request;
  e.respondWith(
    fetch(req)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req))
  );
});

