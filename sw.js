// Service worker: rende il gioco installabile e giocabile offline.
// Cambia VERSION quando aggiorni i file per forzare il nuovo download.
const VERSION = 'flower-tycoon-v4';
const FILES = [
  './', './index.html', './style.css', './game.js', './manifest.json',
  './vendor/three.module.min.js', './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Prima la rete (così gli aggiornamenti arrivano subito), poi la cache se sei offline.
// 'no-cache' chiede sempre al server se il file è cambiato, invece di usare la copia
// che il browser tiene per qualche minuto.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
