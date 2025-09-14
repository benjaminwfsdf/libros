const CACHE_NAME = "biblio-rosa-v5";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest"
  // Nota: Los íconos y este mismo SW se cachean por ruta en fetch.
];

// Instalar: precache del App Shell
self.addEventListener("install", (e)=>{
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// Activar: limpiar versiones viejas
self.addEventListener("activate", (e)=>{
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k))
    ))
  );
  self.clients.claim();
});

// Estrategia: 
// - HTML: Network-first (para no servir HTML viejo).
// - Estáticos (css/js/íconos): Stale-while-revalidate.
// - Portadas e imágenes remotas: Cache-first con fallback a red.
self.addEventListener("fetch", (e)=>{
  const req = e.request;
  const url = new URL(req.url);

  // HTML
  if(req.mode === "navigate" || (req.destination === "document")){
    e.respondWith((async ()=>{
      try{
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, fresh.clone());
        return fresh;
      }catch{
        const cached = await caches.match(req);
        return cached || caches.match("./index.html");
      }
    })());
    return;
  }

  // Estáticos locales
  if(url.origin === location.origin){
    e.respondWith((async ()=>{
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req);
      const network = fetch(req).then(res=>{ cache.put(req, res.clone()); return res; }).catch(()=>null);
      return cached || network;
    })());
    return;
  }

  // Imágenes de portadas y recursos externos (ZXing, OpenLibrary covers)
  if(req.destination === "image" || /covers\.openlibrary\.org|googleapis\.com|unpkg\.com/.test(url.hostname)){
    e.respondWith((async ()=>{
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req);
      if(cached) return cached;
      try{
        const res = await fetch(req, {mode: "cors"});
        cache.put(req, res.clone());
        return res;
      }catch{
        return cached || new Response("", {status: 404});
      }
    })());
  }
});
