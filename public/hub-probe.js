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
/* LIVE ministry hub — the ministry PC's always-online Tailscale Funnel address.
   The static Vercel build (kingdom-bible-wine.vercel.app) is the REAL site and is
   always online, but it has no phone-remote/SSE/service-code hub. When the
   presenter wants the live stage, Ministry Mode offers a one-tap doorway to this
   URL (new tab). Only works while the ministry PC + Tailscale are on — that is
   expected until a proper domain replaces it. Keep in sync with LIVE_HUB_URL. */
const LIVE_HUB_URL='https://desktop-dqg29pr.tail876272.ts.net';

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
    title:'Phone remote needs the live ministry hub',
    body:'This is the main KINGDOM BIBLE site — always online for reading, study and local presenting. The service code, phone remote and live sync run on the live ministry hub (your ministry PC via Tailscale).',
    hint:'Present from here any time. When you need phone control + live sync, open the live hub below — it needs the ministry PC online.',
    steps:['If the ministry PC is on (Tailscale running), tap “Open Live Ministry Hub” below — the live stage opens in a new tab.',
           'On the live hub, go to Ministry Mode and start your session there.',
           'This page keeps working for reading, study and local presenting.'],
    launchUrl:'http://localhost:'+PORT,dot:'off',liveHubUrl:LIVE_HUB_URL
  };
}

g.KingdomHub={APP,PORT,LIVE_HUB_URL,probe,isLive,describe,readJSON};
})(typeof window!=='undefined'?window:globalThis);
