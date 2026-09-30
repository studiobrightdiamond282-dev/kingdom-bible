const VERSION='kingdom-bible-v1.0.0';
const SHELL=[
  '/', '/index.html','/styles.css','/app.js','/ref-parser.js','/search-worker.js','/offline.html','/manifest.json','/favicon.png',
  '/assets/logo.png','/assets/logo-hero.png','/icons/icon-192.png','/icons/icon-512.png','/data/books.json',
  '/data/bibles/kjv/44.json','/data/bibles/kjv/42.json','/data/bibles/kjv/18.json'
];
self.addEventListener('install',e=>e.waitUntil(caches.open(VERSION).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  const r=e.request,u=new URL(r.url);if(r.method!=='GET'||u.origin!==location.origin||u.pathname.startsWith('/api/'))return;
  if(r.mode==='navigate'){e.respondWith(fetch(r).then(x=>{const y=x.clone();caches.open(VERSION).then(c=>c.put('/index.html',y));return x}).catch(()=>caches.match('/index.html').then(x=>x||caches.match('/offline.html'))));return}
  const data=u.pathname.startsWith('/data/');
  if(data){e.respondWith(caches.match(r).then(cached=>cached||fetch(r).then(x=>{if(x.ok)caches.open(VERSION).then(c=>c.put(r,x.clone()));return x})));return}
  e.respondWith(caches.match(r).then(cached=>cached||fetch(r).then(x=>{if(x.ok)caches.open(VERSION).then(c=>c.put(r,x.clone()));return x})));
});
self.addEventListener('message',e=>{if(e.data?.type==='SKIP_WAITING')self.skipWaiting();if(e.data?.type==='CLEAR_CACHE')e.waitUntil(caches.delete(VERSION))});
