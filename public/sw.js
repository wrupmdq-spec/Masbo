// Service worker mínimo: necesario para que el navegador considere la app "instalable".
// No cachea nada de forma agresiva, para evitar que el personal vea datos desactualizados.
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Deja pasar todas las peticiones directamente a la red.
  event.respondWith(fetch(event.request));
});
