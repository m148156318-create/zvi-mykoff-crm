/* Keeps a copy of the app so it opens fast and works without internet. Data itself syncs through Firebase. */
const CACHE='zm-app-v14';
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{
  const req=e.request,url=new URL(req.url);
  if(req.method!=='GET'||url.origin!==location.origin)return;
  e.respondWith(fetch(req,{cache:'no-cache'}).then(res=>{const copy=res.clone();caches.open(CACHE).then(c=>c.put(req,copy));return res}).catch(()=>caches.match(req,{ignoreSearch:true}).then(r=>r||caches.match('./',{ignoreSearch:true}))));
});
