// implement-p4.md 6章: PWA化(手書きService Worker、F0確認: next-pwa等のライブラリは導入しない)。
// output:'export'の静的ビルドはファイル名(ビルドハッシュ)を事前に列挙できないため、
// ビルド時プリキャッシュではなくランタイムキャッシュ方式を採用する。
// 初回オンライン訪問時に取得したページ・静的アセットをキャッシュし、以降のオフライン起動・閲覧に使う。
// IndexedDBのデータそのものはこのキャッシュの対象外(ブラウザのIndexedDBがそのまま機能する)
const CACHE_NAME = 'trade-journal-cache-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  // ページ遷移(HTML): ネットワーク優先、失敗時はキャッシュ→トップページのキャッシュにフォールバック
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('/')))
    );
    return;
  }

  // 静的アセット(JS/CSS/画像等): キャッシュ優先、なければネットワーク取得しキャッシュへ格納
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        const clone = response.clone();
        void caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        return response;
      });
    })
  );
});
