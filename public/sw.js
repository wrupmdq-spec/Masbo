// Service worker mínimo: necesario para que el navegador considere la app "instalable".
// No cachea nada y NO intercepta las escrituras (POST/PATCH/DELETE): así nunca puede bloquear un guardado.
self.addEventListener("install", () => { self.skipWaiting(); });
self.addEventListener("activate", (event) => { event.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;                      // escrituras: directo a la red
  if (!req.url.startsWith(self.location.origin)) return; // Supabase y otros dominios: directo a la red
  event.respondWith(fetch(req));
});
