const CACHE_NAME = "jwtfix78";
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


self.addEventListener("fetch", (e) => {
  const req = e.request;

  // 对页面导航（刷新/打开首页）走网络优先，避免缓存旧 index.html 造成“刷新后未登录/按钮无反应”
  if (req.mode === "navigate") {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        return fresh;
      } catch (err) {
        // 离线兜底：返回缓存里的 index.html（如果有）
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match("./index.html") || await cache.match("./");
        return cached || Response.error();
      }
    })());
    return;
  }

  // 其他静态资源：缓存优先
  e.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);
    if (cached) return cached;
    try {
      const fresh = await fetch(req);
      // 只缓存同源 GET
      if (req.method === "GET" && new URL(req.url).origin === location.origin) {
        cache.put(req, fresh.clone());
      }
      return fresh;
    } catch (err) {
      return cached || Response.error();
    }
  })());
});
