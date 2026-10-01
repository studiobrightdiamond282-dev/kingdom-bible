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
    title:'Ministry hub connected',
    body:'Service codes, the phone remote and the live stream are running on this computer.',
    hint:'Scan the code with any phone on the same Wi-Fi network.',
    steps:[],launchUrl:'http://localhost:'+PORT,dot:''
  };
  if(state==='offline')return {
    title:'The ministry hub is not responding',
    body:'This page is open locally, but nothing is answering on the hub port. Reading and study work offline; the phone remote and live stream need the hub running.',
    hint:'The audience display still works on this computer.',
    steps:['In the KINGDOM BIBLE folder, open a terminal and run `npm start`.',
           'Open the LAN address it prints, for example `http://192.168.1.20:'+PORT+'`.',
           'Come back to Ministry Mode and choose "Check again".'],
    launchUrl:'http://localhost:'+PORT,dot:'off'
  };
  return {
    title:'Phone remote needs the ministry hub',
    body:'This page is running from a website. Reading, study and the audience display all work here, but the service code, the phone remote and live sync are served by the ministry computer itself.',
    hint:'You can still present from this computer: open the audience display and use Presenter control. To control it from a phone, use the local hub.',
    steps:['On the ministry computer, open the KINGDOM BIBLE folder in a terminal.',
           'Run `npm start`.',
           'Open the LAN address it prints, for example `http://192.168.1.20:'+PORT+'`, and go to Ministry Mode.',
           'Choose "Check again" here once the hub is running.'],
    launchUrl:'http://localhost:'+PORT,dot:'off'
  };
}

g.KingdomHub={APP,PORT,probe,isLive,describe,readJSON};
})(typeof window!=='undefined'?window:globalThis);
