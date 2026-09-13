/*
 * Service worker — Registre des personnes vulnérables
 *
 * Stratégie : "réseau d'abord, cache en secours".
 * - Si le réseau répond, on utilise TOUJOURS la version la plus récente (jamais coincé
 *   sur une ancienne version buguée tant qu'il y a du réseau au moins une fois).
 * - Si le réseau est indisponible (terrain, tournée, sous-sol...), on sert la dernière
 *   version mise en cache, pour que l'application reste utilisable hors connexion.
 * - Aucune donnée du registre ne transite jamais par ce fichier : ce service worker ne
 *   connaît que le code de l'application (HTML/CSS/JS/icônes), jamais les données
 *   chiffrées, qui restent uniquement dans le stockage local du navigateur.
 *
 * IMPORTANT : incrémenter CACHE_VERSION à chaque nouvelle version livrée de l'application.
 * C'est ce qui force le navigateur à abandonner proprement l'ancien cache.
 */
const CACHE_VERSION = 'rpv-v31';
const CACHE_NAME = `registre-pv-${CACHE_VERSION}`;

const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .catch(() => {}) // l'app reste fonctionnelle même si la mise en cache initiale échoue partiellement
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name.startsWith('registre-pv-') && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // On ne traite que les requêtes GET same-origin (le code de l'app).
  // Tout le reste (polices Google Fonts, etc.) passe directement au réseau,
  // sans interception ni mise en cache par ce service worker.
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    fetch(req)
      .then((networkResponse) => {
        const copy = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
        return networkResponse;
      })
      .catch(async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        if (req.mode === 'navigate') {
          const fallback = await caches.match('./index.html');
          if (fallback) return fallback;
        }
        return new Response('Hors ligne et rien en cache pour cette ressource.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      })
  );
});
