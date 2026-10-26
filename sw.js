/* Service worker : rend l'app disponible hors ligne et pousse les mises à jour.
   Changer VERSION à chaque publication force le rafraîchissement du cache. */
const VERSION = 'ndf-2026-10-26-1';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './jszip.min.js',
  './jspdf.umd.min.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  // Les appels à l'API (ou au relais) ne passent jamais par le cache.
  if (url.origin !== self.location.origin || req.method !== 'GET') return;

  if (req.mode === 'navigate') {
    // Page : réseau d'abord (pour récupérer une nouvelle version), cache sinon.
    event.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(VERSION).then(cache => cache.put('./index.html', copy));
        return res;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Ressources : cache d'abord, mise à jour en arrière-plan.
  event.respondWith(
    caches.match(req).then(cached => {
      const refresh = fetch(req).then(res => {
        if (res.ok) caches.open(VERSION).then(cache => cache.put(req, res.clone()));
        return res;
      }).catch(() => cached);
      return cached || refresh;
    })
  );
});
