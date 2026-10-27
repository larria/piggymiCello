/* 咪猪头拉大提琴 Service Worker — 应用外壳缓存 + 安全 PWA 更新
   RELEASE 每次发版手动递增,驱动缓存换代与新版本检测 */
const RELEASE = 'v3';
const PREFIX = 'piggy-cello-';
const CACHE = PREFIX + RELEASE;

/* 相对注册 scope 解析,兼容 GitHub Pages 子路径(/piggymiCello/) */
const base = new URL(self.registration.scope).pathname;
const url = path => new URL(path.replace(/^\//, ''), self.registration.scope).href;
const inScope = value => {
  const parsed = new URL(value);
  return parsed.origin === self.location.origin && parsed.pathname.startsWith(base);
};

self.addEventListener('install', event => event.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  const ASSETS = [
    url(''),
    url('index.html'),
    url('manifest.json'),
    url('icons/icon-192x192.png'),
    url('icons/icon-512x512.png'),
    url('icons/apple-touch-icon.png'),
  ];
  await cache.addAll(ASSETS);
  /* 有意等待用户在页面上确认后才 skipWaiting,绝不安装即接管 */
})()));

self.addEventListener('message', event => {
  if (event.data?.type !== 'SKIP_WAITING') return;
  const port = event.ports?.[0];
  if (!port) return; /* 激活必须走带确认的请求协议 */
  event.waitUntil((async () => {
    try {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.filter(client => inScope(client.url));
      if (open.length !== 1 || open[0].id !== event.source?.id) {
        port.postMessage({ ok: false, error: '请先关闭其他咪猪头窗口,再重试更新。' });
        return;
      }
      port.postMessage({ ok: true });
      await self.skipWaiting();
    } catch (error) {
      port.postMessage({ ok: false, error: error instanceof Error ? error.message : '更新未能应用。' });
    }
  })());
});

self.addEventListener('activate', event => event.waitUntil((async () => {
  const keys = (await caches.keys()).filter(name =>
    typeof name === 'string' && name.startsWith(PREFIX));
  for (const key of keys) if (key !== CACHE) await caches.delete(key);
  await self.clients.claim();
})()));

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || !inScope(event.request.url)) return;
  const request = event.request;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const saved = await cache.match(request, { ignoreSearch: true });
    if (saved) return saved;
    const path = new URL(request.url).pathname;
    const isEntry = request.mode === 'navigate' || path === base || path === base + 'index.html';
    const response = await fetch(request, isEntry ? { cache: 'no-store' } : undefined);
    if (response.ok) {
      const copy = response.clone();
      event.waitUntil(cache.put(request, copy));
    }
    return response;
  })());
});
