const CACHE_NAME = 'brainblock-v1';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './main.js',
  './manifest.webmanifest',

  // 🧩 遊戲資料
  './data/config.json',
  './data/levels.json',
  './data/puzzles.json',

  // 🖼️ 圖示與圖像素材
  './public/app-icon/app_icon.png',

  // 你可以依實際情況繼續加上：
  // './public/icons/nav/arrow_next.svg',
  // './public/icons/status/btn_solved.svg',
  // './public/badges/xxx_locked.svg',
  // './public/badges/xxx_unlocked.png',
];

// 安裝階段：快取基本檔案
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

// 啟用階段：清除舊版本快取
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => (k === CACHE_NAME ? null : caches.delete(k))))
    )
  );
});

// 請求攔截：網路優先、離線備援
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
