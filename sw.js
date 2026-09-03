/* 掼蛋训练营 Service Worker：静态资源缓存（离线可玩 + 支持添加到主屏幕） */
var CACHE = 'guandan-cache-v1';
var CORE = [
  'index.html', 'manifest.webmanifest', 'icon.svg',
  'css/style.css',
  'js/rules.js', 'js/cards.js', 'js/combos.js', 'js/movegen.js', 'js/ai.js',
  'js/advisor.js', 'js/sfx.js', 'js/game.js', 'js/ui.js', 'js/app.js'
];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(CORE); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(function (hit) {
    if (hit) return hit;
    return fetch(e.request).then(function (resp) {
      if (resp && resp.ok && new URL(e.request.url).origin === location.origin) {
        var copy = resp.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
      }
      return resp;
    }).catch(function () { return caches.match('index.html'); });
  }));
});
