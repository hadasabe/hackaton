/* App shell only. OSM tiles are deliberately never prefetched or cached here. */
const CACHE='ryadom-mvp-33';
const CORE=['./','./index.html','./style.css','./app.js','./geo.js','./experience.js','./experience.css','./data/places.js','./data/audio-manifest.js','./vendor/leaflet.js','./vendor/leaflet.css','./manifest.webmanifest','./assets/mark.svg','./assets/conservatory.svg','./assets/icon-192.png','./assets/icon-512.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('ryadom-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
 const inScope=url.pathname.startsWith(new URL(self.registration.scope).pathname);if(!inScope)return;
 const isCore=CORE.some(p=>new URL(p,self.registration.scope).pathname===url.pathname);
 const isAudio=url.pathname.startsWith(new URL('./audio/',self.registration.scope).pathname);
 const isPhoto=url.pathname.startsWith(new URL('./assets/photos/',self.registration.scope).pathname);
 if(!isCore&&!isAudio&&!isPhoto)return;
 event.respondWith(fetch(event.request).then(response=>{if(response.ok&&response.status===200){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)));}return response;}).catch(()=>caches.match(event.request).then(cached=>cached||new Response('Нет локальной копии файла',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}}))));
});
