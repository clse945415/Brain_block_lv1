// === Brain Block SW (auto-upgrade) ===
// ① 每次上線把版本改一個新字串（日期 or 0.0.1 皆可）
const CACHE_VERSION = 'v2025-10-13-1';
const CACHE_NAME = `brainblock-${CACHE_VERSION}`;

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

// install: 立即啟用 + ② 強制繞過瀏覽器快取抓新檔
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))
    )
  );
});

// activate: 清舊版快取 + ③ 立刻控制所有 clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k))));
      await self.clients.claim();
    })()
  );
});

// fetch：HTML/JSON 走「網路優先」，其他走「快取優先」（離線開更快）
self.addEventListener('fetch', (event) => {
  const req = event.request;
  // 只攔 GET
  if (req.method !== 'GET') return;

  const accept = req.headers.get('accept') || '';

  // 導航頁 & JSON：network-first（確保拿到最新）
  const isHTML = accept.includes('text/html');
  const isJSON = req.destination === '' && req.url.endsWith('.json');

  if (isHTML || isJSON) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // 其他（CSS/JS/圖片）：cache-first（快）
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        return res;
      });
    })
  );
});
