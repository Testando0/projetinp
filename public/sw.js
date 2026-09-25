// GMPOL Service Worker v1.0
const CACHE_NAME = 'gmpol-cache-v13';
const OFFLINE_URL = '/';

// Recursos críticos para cache offline
const PRECACHE_RESOURCES = [
  '/',
  '/index.html',
  '/css/style.css',
  '/css/extra.css',
  '/js/api.js',
  '/js/app.js',
  '/logo.png'
];

// Instalação: pré-cache dos recursos
self.addEventListener('install', (event) => {
  console.log('[SW] Instalando...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Pré-cacheando recursos...');
        return cache.addAll(PRECACHE_RESOURCES);
      })
      .then(() => self.skipWaiting())
  );
});

// Ativação: limpa caches antigos
self.addEventListener('activate', (event) => {
  console.log('[SW] Ativando...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Removendo cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: estratégia "Network First" com fallback para cache
self.addEventListener('fetch', (event) => {
  // Ignora requests não-GET e WebSocket
  if (event.request.method !== 'GET') return;
  if (event.request.url.includes('/ws')) return;
  
  // Para requests de API, usa network first (sempre busca dados frescos)
  if (event.request.url.includes('/api/')) {
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          // Se falhar, tenta do cache (para dados offline)
          return caches.match(event.request);
        })
    );
    return;
  }
  
  // Para arquivos estáticos, tenta rede primeiro, depois cache
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Clona a resposta e adiciona ao cache
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Se não houver rede, tenta do cache
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // Se for página HTML, retorna a página offline
          if (event.request.mode === 'navigate') {
            return caches.match(OFFLINE_URL);
          }
          return new Response('Offline - GMPOL', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({ 'Content-Type': 'text/plain' })
          });
        });
      })
  );
});

// Mensagens do cliente
self.addEventListener('message', (event) => {
  if (event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});
