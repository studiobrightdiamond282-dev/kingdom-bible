/* KINGDOM BIBLE — ministry hub detection
   ------------------------------------------------------------------
   The phone remote, the service code, the SSE stream and server-side
   verse resolution all live in the local Node hub (npm start). A static
   host such as Vercel serves public/ and nothing else, so the ministry
   controls are genuinely unavailable there.

   The trap this module exists to close: a static host answers GET /health
   with **200 text/html** (the SPA rewrite catches every unknown path) and
   with **404** on /api/*. A status-code check therefore reports a dead hub
   as "live". A hub is only ever considered real when the body is JSON that
   carries our own application marker.

   Dependency-free and DOM-free so it can be unit tested in Node, exactly
   like qr.js. Exposes window.KingdomHub. */
(function(g){
'use strict';
const APP='KINGDOM BIBLE';
const PORT=4173;
/* Render is the live ministry hub; Vercel is a static reader deployment.
   Keep this in sync with the server's LIVE_HUB_URL setting. */
const LIVE_HUB_URL='https://kingdom-bible.onrender.com';

/* GET a path and try to read it as JSON. Never throws. */
async function readJSON(path,fetchImpl){
  let r;
  try{ r=await (fetchImpl||g.fetch)(path,{cache:'no-store'}) }
  catch{ return {status:0,json:false,body:null,error:true} }
  const ct=String((r.headers&&r.headers.get&&r.headers.get('content-type'))||'').toLowerCase();
  /* A static host hands back the app shell. Not JSON means not a hub, whatever
     the status code says. */
  if(ct.indexOf('json')<0)return {status:r.status,json:false,body:null,error:false};
  try{ return {status:r.status,json:true,body:await r.json(),error:false} }
  catch{ return {status:r.status,json:true,body:null,error:false} }
}

/* -> 'online' | 'static' | 'offline' */
async function probe(fetchImpl){
  const r=await readJSON('/health',fetchImpl);
  /* unreachable: nothing answered at all (a local page whose hub is down) */
  if(r.error)return 'offline';
  /* real hub: 2xx, JSON, and stamped as this application */
  if(r.status>=200&&r.status<300&&r.body&&r.body.ok===true&&r.body.app===APP)return 'online';
  /* everything else is a host with no hub behind it (Vercel, GitHub Pages, file://) */
  return 'static';
}

const isLive=state=>state==='online';

/* Copy the presenter sees. Kept here so the app shell, the phone remote and the
   status page all explain an offline hub in exactly the same words. */
function describe(state){
  if(isLive(state))return {
    title:'Live ministry hub connected',
    body:'Service codes, the phone remote and the live presentation stream are available on this hub.',
    hint:'Scan the QR or open the full phone link. Local hubs need both devices on the same Wi-Fi.',
    steps:[],launchUrl:'http://localhost:'+PORT,dot:''
  };
  if(state==='offline')return {
    title:'The local ministry hub is not responding',
    body:'This page is open locally, but nothing is answering on the hub port. Reading and study work offline; phone control needs a running ministry hub.',
    hint:'Use the online Render hub or start the hub on this computer. The presenter and phone must use the same hub.',
    steps:['For online phone control, open the Live Ministry Hub and start a session in Ministry Mode.',
           'For an offline/local service, run `npm start` in the KINGDOM BIBLE folder on the ministry computer.',
           'Open the LAN address it prints on both the presenter and phone.',
           'Come back to Ministry Mode and choose "Check again".'],
    launchUrl:'http://localhost:'+PORT,liveHubUrl:LIVE_HUB_URL,dot:'off'
  };
  return {
    title:'Phone remote needs the live ministry hub',
    body:'This static Bible reader cannot create a service code or pair a phone. Open the live Render hub for phone control, or run the local hub on the ministry computer.',
    hint:'The presenter and phone must open the same hub. Ministry Mode on that hub shows a QR code and full phone link.',
    steps:['Tap "Open Live Ministry Hub" and wait briefly if the service is waking up.',
           'On Render, open Ministry Mode, then scan its QR or use its code-bearing phone link.',
           'For a local/offline service instead, run `npm start` on the ministry computer and open its LAN address.'],
    launchUrl:'http://localhost:'+PORT,liveHubUrl:LIVE_HUB_URL,dot:'off'
  };
}

g.KingdomHub={APP,PORT,LIVE_HUB_URL,probe,isLive,describe,readJSON};
})(typeof window!=='undefined'?window:globalThis);
