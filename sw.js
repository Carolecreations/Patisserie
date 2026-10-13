/* ═══════════════════════════════════════════════════════
   Service Worker — Sweet & Sip
   Cache-first pour les pages, network-first pour le reste
   ═══════════════════════════════════════════════════════ */
const CACHE_NAME = 'sweet-sip-v1';
const CACHE_VERSION = 1;

/* Fichiers essentiels à précacher (chemins relatifs au SW) */
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './sucre1/',
  './sucre1/index.html',
  './sucre2/',
  './sucre2/index.html'
];

/* ─────────────────────────────────────────
   Installation : précache les fichiers essentiels
   ───────────────────────────────────────── */
self.addEventListener('install', function(event){
  console.log('[SW] Installation');
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache){
      return cache.addAll(PRECACHE_URLS.map(function(url){
        /* On utilise {cache: 'reload'} pour ignorer le cache HTTP du navigateur */
        return new Request(url, { cache: 'reload' });
      })).catch(function(err){
        console.warn('[SW] Précache partiel :', err);
        /* On continue même si un fichier manque — le runtime-cache prendra le relais */
      });
    }).then(function(){
      return self.skipWaiting();
    })
  );
});

/* ─────────────────────────────────────────
   Activation : nettoie les anciens caches
   ───────────────────────────────────────── */
self.addEventListener('activate', function(event){
  console.log('[SW] Activation');
  event.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(
        keys.filter(function(k){ return k !== CACHE_NAME; })
            .map(function(k){ return caches.delete(k); })
      );
    }).then(function(){
      return self.clients.claim();
    })
  );
});

/* ─────────────────────────────────────────
   Fetch : stratégie hybride
   ───────────────────────────────────────── */
self.addEventListener('fetch', function(event){
  const req = event.request;
  const url = new URL(req.url);

  /* Ne pas intercepter les requêtes non-GET */
  if(req.method !== 'GET') return;

  /* Ne pas intercepter les requêtes cross-origin sauf Google Fonts */
  if(url.origin !== self.location.origin && !url.hostname.includes('fonts.google')){
    return;
  }

  /* ─── Stratégie 1 : Pages HTML et JSON → Network-first */
  /* (pour avoir toujours la dernière version quand on est en ligne) */
  if(
    req.destination === 'document' ||
    url.pathname.endsWith('.html') ||
    url.pathname.endsWith('.json') ||
    url.pathname.endsWith('/')
  ){
    event.respondWith(
      fetch(req).then(function(response){
        if(response && response.status === 200){
          const copy = response.clone();
          caches.open(CACHE_NAME).then(function(cache){
            cache.put(req, copy);
          });
        }
        return response;
      }).catch(function(){
        return caches.match(req).then(function(cached){
          if(cached) return cached;
          /* Fallback : le portail */
          return caches.match('./index.html');
        });
      })
    );
    return;
  }

  /* ─── Stratégie 2 : Photos, icônes, CSS, JS → Cache-first */
  /* (plus rapide, économise la bande passante) */
  event.respondWith(
    caches.match(req).then(function(cached){
      if(cached) return cached;
      return fetch(req).then(function(response){
        if(response && response.status === 200 && response.type === 'basic'){
          const copy = response.clone();
          caches.open(CACHE_NAME).then(function(cache){
            cache.put(req, copy);
          });
        }
        return response;
      }).catch(function(){
        /* Fallback silencieux pour les images */
        if(req.destination === 'image'){
          return new Response('', { status: 404, statusText: 'Offline' });
        }
        throw new Error('Offline');
      });
    })
  );
});

/* ─────────────────────────────────────────
   Message : permet de forcer la mise à jour depuis l'app
   ───────────────────────────────────────── */
self.addEventListener('message', function(event){
  if(event.data && event.data.type === 'SKIP_WAITING'){
    self.skipWaiting();
  }
});