/* Cache version follows package.json so installed clients receive every shipped fix. */
const VERSION='kingdom-bible-v1.2.11';
const SHELL=[
  '/', '/index.html','/theme-init.js','/styles.css','/demo-tour.css','/demo-tour.js','/app.js','/devotionals.js','/reading-plans.js','/auth-fix.js','/profile-fix.js','/reader-fix.js','/study-fix.js','/audit-fix.js','/premium.js','/qr.js','/hub-probe.js','/analytics.js','/privacy-analytics.js','/bible-ref.js','/voice.js','/remote.js','/remote.html','/admin.html','/privacy.html','/refund.html','/status.html','/status.js',
  '/search-worker.js','/offline.html','/manifest.json','/favicon.svg','/favicon.png',
  '/assets/logo.png','/assets/logo-hero.png','/assets/logo-social.png','/assets/kingdom-bible-product-preview.jpg?v=1.2.11','/icons/icon-192.png','/icons/icon-512.png','/data/books.json',
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

  /* HTML video seeks use Range requests and return partial (206) responses, which
     CacheStorage cannot store. Keep preview media network-only; its small poster is
     already part of the offline shell cache. */
  if(/\.(mp4|webm|mov)$/i.test(u.pathname)){e.respondWith(fetch(r));return}

  const data=u.pathname.startsWith('/data/');
  e.respondWith(caches.match(r).then(cached=>cached||fetch(r).then(x=>{
    if(x.ok)caches.open(VERSION).then(c=>c.put(r,x.clone()));
    return x;
  })));
});
self.addEventListener('message',e=>{if(e.data?.type==='SKIP_WAITING')self.skipWaiting();if(e.data?.type==='CLEAR_CACHE')e.waitUntil(caches.delete(VERSION))});
