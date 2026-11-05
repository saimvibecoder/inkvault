// Inkvault offline cache: the app shell and its libraries. Comic files are never cached.
const CACHE='inkvault-v3';
const SHELL=['/','/manifest.webmanifest','/icon-192.png','/icon.svg',
  '/lib/pdf.min.js','/lib/pdf.worker.min.js','/lib/jszip.min.js',
  '/rar.js','/unrar.wasm','/worker.js'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>Promise.all(SHELL.map(u=>c.add(u).catch(()=>{})))).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{const req=e.request;if(req.method!=='GET')return;const url=new URL(req.url);
  if(req.mode==='navigate'){e.respondWith(fetch(req).then(r=>{const cp=r.clone();caches.open(CACHE).then(c=>c.put('/',cp));return r;}).catch(()=>caches.match('/')));return;}
  const cacheable=url.origin===location.origin||/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if(!cacheable)return;
  e.respondWith(caches.match(req).then(hit=>{const net=fetch(req).then(r=>{if(r&&(r.ok||r.type==='opaque')){const cp=r.clone();caches.open(CACHE).then(c=>c.put(req,cp));}return r;}).catch(()=>hit);return hit||net;}));});
