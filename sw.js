const CACHE = 'wardrobe-v28';
const ASSETS = ['./', './index.html', './styles.css', './js/db.js', './js/weather.js', './js/gemini.js', './js/outfits.js', './js/app.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.url.includes('generativelanguage.googleapis.com') ||
      e.request.url.includes('api.open-meteo.com') ||
      e.request.url.includes('nominatim.openstreetmap.org') ||
      e.request.url.includes('ipapi.co') ||
      e.request.url.includes('ip-api.com')) return;
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).catch(() => caches.match(new URL('./index.html', self.location).href)))
  );
});
