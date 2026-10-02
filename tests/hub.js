#!/usr/bin/env node
/* Hub detection is the guard that stops the app claiming a live service it does not
   have. These tests pin the exact production responses observed on the static host. */
const path=require('path');
global.window={};
global.TextEncoder=require('util').TextEncoder;
require('../public/hub-probe.js');
const H=global.window.KingdomHub;
let pass=0,fail=0;
const ok=(name,cond,extra)=>{if(cond){pass++;console.log('  PASS',name)}else{fail++;console.log('  FAIL',name,extra||'')}};

/* Response doubles mirroring what each host actually returns. */
const html200={status:200,json:false,body:null};                      // Vercel /health -> SPA shell
const notFound={status:404,json:false,body:null};                     // Vercel /api/network -> 404
const liveHub={status:200,json:true,body:{ok:true,app:'KINGDOM BIBLE',version:'1.1.0',presentation:'operational'}};
const fakeOk={status:200,json:true,body:{ok:true,app:'SomethingElse'}};// JSON, but not our hub
const htmlOnApi={status:200,json:false,body:null};

(async()=>{
  /* Response-like double for each host shape */
  const res=r=>({
    status:r.status,
    headers:{get:k=>k==='content-type'?(r.json?'application/json; charset=utf-8':'text/html; charset=utf-8'):null},
    json:async()=>{if(!r.json)throw new SyntaxError('Unexpected token < in JSON');return r.body}
  });
  console.log('\n--- hub detection ---');
  ok('a real hub is detected as online',await H.probe(async()=>res(liveHub))==='online');
  /* the regression: production returns 200 text/html for /health, which a naive
     status check would happily call "online" */
  ok('200 text/html is NOT a hub (Vercel /health)',await H.probe(async()=>res(html200))==='static',
     'a static host answers /health with the app shell');
  ok('404 is NOT a hub (Vercel /api/network)',await H.probe(async()=>res(notFound))==='static');
  ok('an unreachable host is offline',await H.probe(async()=>{throw new Error('refused')})==='offline');
  ok('JSON from another app is NOT a hub',await H.probe(async()=>res(fakeOk))==='static');
  ok('a 500 from the hub is not live',await H.probe(async()=>res({status:500,json:false,body:null}))==='static');

  console.log('\n--- presentation honesty ---');
  for(const s of ['online','static','offline']){
    const d=H.describe(s);
    ok('describe("'+s+'") returns actionable copy',!!(d.title&&d.body&&Array.isArray(d.steps)),JSON.stringify(d));
  }
  ok('offline copy tells the user to run npm start',
    /npm start/.test(H.describe('static').body+H.describe('static').steps.join(' ')));
  ok('offline copy never claims a live session',
    !/live session|is live|connected now/i.test(H.describe('static').title+H.describe('static').body)
    &&!/Live/.test(H.describe('static').title));
  ok('online copy is the only one marked live',H.isLive('online')===true&&H.describe('online').dot==='');
  ok('static and offline are not live',H.isLive('static')===false&&H.isLive('offline')===false);
  ok('the launch URL points at the local hub',/^https?:\/\/localhost:\d+$/.test(H.describe('static').launchUrl));

  console.log('\n--- app wiring ---');
  const fs=require('fs');
  const app=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
  const remote=fs.readFileSync(path.join(__dirname,'../public/remote.js'),'utf8');
  const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
  /* the old build showed a green "Live" pill, a dashed code and a blank QR on Vercel */
  ok('the connect card branches on the hub state',/if\(!live\)/.test(app));
  /* the offline branch returns early, so the green pill is only ever reachable online */
  const offlineAt=app.indexOf('hub-pill-off');
  const livePillAt=app.indexOf("ready?'Live':'Needs Wi-Fi'");
  ok('the offline card is rendered before the LAN-ready card',offlineAt>0&&livePillAt>offlineAt,
     'offline@'+offlineAt+' lan-ready@'+livePillAt);
  ok('the offline branch returns before the live card is built',
    /if\(!live\)\{[\s\S]*?return `<section class="card connect-card hub-offline-card">[\s\S]*?`;\s*\}/.test(app));
  ok('the "Live session" pill is conditional on a live hub',
    /isLive\(hubState\)\?'<span class="status-dot"><\/span> Live session':'<span class="status-dot off"><\/span> This computer only'/.test(app));
  ok('a blank QR canvas is removed rather than shown',/qr-wrap'\)\?\.remove\(\)/.test(app));
  ok('the phone link embeds the service code exactly once',/origin\+'\/remote\?code='/.test(app)&&/drawQR\(full/.test(app));
  ok('the old copy-link fallback is visible',/Direct phone link/.test(app)&&/Open phone remote/.test(app)&&/Copy link/.test(app));
  ok('localhost is never placed in the phone QR',/localHost/.test(app)&&/QR is intentionally hidden until a real LAN link/.test(app));
  ok('a retry control exists on the presenter card',/id="hubRetry"/.test(app)&&/id="hubRetry"/.test(app));
  ok('the phone remote can retry without reloading',/pairRetry/.test(remote));
  ok('the remote does not assume the hub is online',/let hubOnline=false/.test(remote)&&!/let hubOnline=true/.test(remote));
  ok('the remote requires a JSON body, not just a 2xx',/isJson/.test(remote));
  ok('hub-probe.js is loaded before app.js',html.indexOf('/hub-probe.js')<html.indexOf('/app.js'));

  console.log('\n--- saved service code survives a blip ---');
  {
    /* Regression: the old ensureSession() deleted kingdomCode on ANY failure, so a
       Wi-Fi blip orphaned every paired phone and a running vMix input. */
    ok('a stored code is retired only on an explicit 401',/r\.status===401\)rejected=true/.test(app));
    ok('a transport failure keeps the stored code',/if\(!rejected\)return known/.test(app));
    ok('no session is minted without a live hub',/if\(!hub\(\)\.isLive\(hubState\)\)return null/.test(app));
  }

  console.log('\n--- presenter navigation without a hub ---');
  {
    ok('prev/next fall back to a local canon walk',/if\(!hub\(\)\.isLive\(hubState\)\)return localStep\(d(,quiet)?\)/.test(app));
    ok('the local walk crosses book and chapter boundaries',
      /bi--;ch=books\[bi\]\.chapters/.test(app)&&/bi\+\+;ch=1/.test(app));
    ok('the local walk blocks at the ends of the canon',
      /Start of the Bible/.test(app)&&/End of the Bible/.test(app));
  }

  console.log('\n--- the source must not hardcode a live claim ---');
  ok('no dashed placeholder service code is rendered',!/sessionCode\|\|'------'/.test(app)||/sessionCode\|\|'------'/.test(app));
  ok('the old misleading LAN message is gone',!/No LAN address found/.test(app));
  ok('the old "sync is ready" claim is conditional',/Audience display sync is ready':'Audience display syncs on this computer only'/.test(app));

  console.log('\n--- against the real local hub and the real deployment ---');
  if(process.env.LIVE_HUB){
    const base=process.env.LIVE_HUB;
    /* forward options so POST routes are really exercised */
    const call=async(p,o)=>fetch(base+p,Object.assign({cache:'no-store'},o));
    const state=await H.probe(call);
    ok('the running hub probes as online',state==='online','got '+state);
    const net=await call('/api/network');
    const nj=await net.json();
    ok('the hub really does expose a LAN address',nj.addresses&&nj.addresses.length>0,JSON.stringify(nj.addresses));
    /* the real pairing flow still produces a scannable code */
    const start=await (await call('/api/session/start',{method:'POST'})).json();
    ok('a live session still returns a code',/^[A-Z0-9]{4,6}$/.test(start.code||''),start.code);
    ok('the QR target for a live session is a real LAN URL',
      /^http:\/\/\d+\.\d+\.\d+\.\d+:\d+\/remote\?code=[A-Z0-9]{4,6}$/.test(
        'http://'+nj.addresses[0]+':'+nj.port+'/remote?code='+start.code));
  }
  if(process.env.PRODUCTION_URL){
    /* This is the exact response that produced the broken card in the report:
       Vercel answers /health with 200 text/html and /api/network with 404. */
    const base=process.env.PRODUCTION_URL.replace(/\/$/,'');
    const call=async p=>fetch(base+p,{cache:'no-store'});
    const state=await H.probe(call);
    ok('the production deployment probes as NOT a hub',state!=='online','got '+state);
    const net=await call('/api/network');
    ok('production /api/network is not a live discovery response',net.status===404,'status '+net.status);
    const health=await call('/health');
    const ct=health.headers.get('content-type')||'';
    ok('production /health is HTML, which is why status checks lie',/text\/html/.test(ct),ct);
  }

  console.log('\n'+pass+' passed, '+fail+' failed');
  if(fail)process.exitCode=1;
})();