const CACHE_NAME = "order-system-v20-20260207-authpersist";
const APP_SHELL = ["./","./index.html","./manifest.json","./icon-192.png","./icon-512.png","./sw.js"];
self.addEventListener("install",(e)=>{
  e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(APP_SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate",(e)=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(k=>k!==CACHE_NAME?caches.delete(k):Promise.resolve()))).then(()=>self.clients.claim()));
});
self.addEventListener("fetch",(e)=>{
  if(e.request.method!=="GET") return;
  const url = new URL(e.request.url);
  if(url.origin===location.origin){
    e.respondWith(caches.match(e.request).then(cached=>cached || fetch(e.request).then(resp=>{
      const copy = resp.clone();
      caches.open(CACHE_NAME).then(c=>c.put(e.request, copy)).catch(()=>{});
      return resp;
    }).catch(()=>cached)));
  }
});
