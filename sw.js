// Inkvault offline cache: the app shell and its libraries. Comic files are never cached.
const CACHE='inkvault-v1';
const SHELL=['/','/manifest.webmanifest','/icon-192.png','/icon.svg',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  'https://cdn.jsdelivr.net/npm/node-unrar-js@2.0.2/+esm',
  'https://cdn.jsdelivr.net/npm/node-unrar-js@2.0.2/esm/js/unrar.wasm'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>Promise.all(SHELL.map(u=>c.add(u).catch(()=>{})))).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{const req=e.request;if(req.method!=='GET')return;const url=new URL(req.url);
  if(req.mode==='navigate'){e.respondWith(fetch(req).then(r=>{const cp=r.clone();caches.open(CACHE).then(c=>c.put('/',cp));return r;}).catch(()=>caches.match('/')));return;}
  const cacheable=url.origin===location.origin||/(^|\.)cdnjs\.cloudflare\.com$|^cdn\.jsdelivr\.net$|fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if(!cacheable)return;
  e.respondWith(caches.match(req).then(hit=>{const net=fetch(req).then(r=>{if(r&&(r.ok||r.type==='opaque')){const cp=r.clone();caches.open(CACHE).then(c=>c.put(req,cp));}return r;}).catch(()=>hit);return hit||net;}));});
