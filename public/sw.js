/* Bumped for the Home revert: without this every returning install keeps serving
   the cached explainer bundle and the dashboard never appears. */
const VERSION='kingdom-bible-v1.2.1-auditfix';
const SHELL=[
  '/', '/index.html','/styles.css','/app.js','/auth-fix.js','/profile-fix.js','/reader-fix.js','/study-fix.js','/audit-fix.js','/premium.js','/qr.js','/hub-probe.js','/bible-ref.js','/voice.js','/remote.js','/remote.html','/admin.html','/admin.js','/privacy.html','/refund.html','/status.html',
  '/search-worker.js','/offline.html','/manifest.json','/favicon.svg','/favicon.png',
  '/assets/logo.png','/assets/logo-hero.png','/icons/icon-192.png','/icons/icon-512.png','/data/books.json',
  '/data/bibles/kjv/44.json','/data/bibles/kjv/42.json','/data/bibles/kjv/18.json'
];
/* live routes must never be served from cache: a stale verse on a projector is worse than no verse */
const LIVE=['/present','/remote'];
const isLive=u=>LIVE.some(p=>u.pathname===p||u.pathname.startsWith(p+'/')||u.pathname.startsWith(p+'?'));

self.addEventListener('install',e=>e.waitUntil(caches.open(VERSION).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));

self.addEventListener('fetch',e=>{
  const r=e.request,u=new URL(r.url);
  if(r.method!=='GET'||u.origin!==location.origin||u.pathname.startsWith('/api/'))return;

  if(r.mode==='navigate'){
    e.respondWith((async()=>{
      if(isLive(u))return fetch(r);              /* network only */
      try{
        const net=await fetch(r);
        if(net.ok){const c=await caches.open(VERSION);c.put(r,net.clone())}
        return net;
      }catch{
        return (await caches.match(r))||(await caches.match('/index.html'))||(await caches.match('/offline.html'));
      }
    })());
    return;
  }

  const data=u.pathname.startsWith('/data/');
  e.respondWith(caches.match(r).then(cached=>cached||fetch(r).then(x=>{
    if(x.ok)caches.open(VERSION).then(c=>c.put(r,x.clone()));
    return x;
  })));
});
self.addEventListener('message',e=>{if(e.data?.type==='SKIP_WAITING')self.skipWaiting();if(e.data?.type==='CLEAR_CACHE')e.waitUntil(caches.delete(VERSION))});
