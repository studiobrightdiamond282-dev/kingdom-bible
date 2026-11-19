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
const liveHub={status:200,json:true,body:{ok:true,app:'KINGDOM BIBLE',version:'1.2.3',presentation:'operational'}};
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
    /npm start/.test(H.describe('offline').body+H.describe('offline').steps.join(' ')));
  ok('static copy points at the live ministry hub doorway',
    /live ministry hub/i.test(H.describe('static').body+H.describe('static').steps.join(' '))
    &&/^https:\/\/kingdom-bible\.onrender\.com$/.test(H.describe('static').liveHubUrl||H.LIVE_HUB_URL||''));
  ok('offline copy never claims a live session',
    !/live session|is live|connected now/i.test(H.describe('static').title+H.describe('static').body)
    &&!/Live/.test(H.describe('static').title));
  ok('online copy is the only one marked live',H.isLive('online')===true&&H.describe('online').dot==='');
  ok('static and offline are not live',H.isLive('static')===false&&H.isLive('offline')===false);
  ok('the launch URL points at the local hub',/^https?:\/\/localhost:\d+$/.test(H.describe('static').launchUrl));
  ok('offline guidance offers Render as well as local startup',H.describe('offline').liveHubUrl===H.LIVE_HUB_URL&&/open the Live Ministry Hub/i.test(H.describe('offline').steps.join(' ')));

  console.log('\n--- app wiring ---');
  const fs=require('fs');
  const app=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
  const remote=fs.readFileSync(path.join(__dirname,'../public/remote.js'),'utf8');
  const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
  const styles=fs.readFileSync(path.join(__dirname,'../public/styles.css'),'utf8');
  console.log('\n--- presentation text encoding ---');
  ok('app.js contains no C1 controls or replacement glyphs',!/[\u007f-\u009f\ufffd]/i.test(app));
  ok('reader and ministry Previous controls use a visible left arrow',(app.match(/← Previous/g)||[]).length>=2);
  ok('cross-reference and trial-time icons are visible Unicode symbols',app.includes('↔</span>Cross refs')&&app.includes('⏳ <strong>'));
  ok('presenter preview wraps verse text with real curly quotation marks',/<blockquote>“\$\{esc\(cur\.text\)\}”<\/blockquote>/.test(app));
  ok('live presenter-preview updates keep the same quotation marks',/el\.innerHTML=`<blockquote>“\$\{esc\(v\.text\)\}”<\/blockquote>/.test(app));
  ok('audience stage wraps verse text with real curly quotation marks',/verseBox\.innerHTML=`<blockquote>“\$\{body\}”<\/blockquote>/.test(app));
  const nowCardRule=(styles.match(/\.live-now\{([^}]*)\}/)||[])[1]||'';
  const nowVerseRule=(styles.match(/\.live-now blockquote\{([^}]*)\}/)||[])[1]||'';
  ok('phone remote reserves a fixed-height current-verse card',/height:\s*220px/.test(nowCardRule)&&/display:\s*flex/.test(nowCardRule)&&/overflow:\s*hidden/.test(nowCardRule));
  ok('long remote verse text scrolls inside its reserved card',/overflow-y:\s*auto/.test(nowVerseRule)&&/min-height:\s*0/.test(nowVerseRule));
  /* the old build showed a green "Live" pill, a dashed code and a blank QR on Vercel */
  ok('the connect card branches on the hub state',/if\(!live\)/.test(app));
  /* the offline branch returns early, so the green pill is only ever reachable online */
  const offlineAt=app.indexOf('hub-pill-off');
  const livePillAt=app.indexOf('const ready=!!phoneUrl');
  ok('the offline card is rendered before live phone pairing',offlineAt>0&&livePillAt>offlineAt,
     'offline@'+offlineAt+' pairing@'+livePillAt);
  ok('the offline branch renders the live doorway first, then the local-only card',
    /liveHubCardHtml\(\)/.test(app)&&/const offlineCard=`<section class="card connect-card hub-offline-card">/.test(app)
    &&/return `\$\{liveHubCardHtml\(\)\}\$\{offlineCard\}`/.test(app));
  ok('the "Live session" pill is conditional on a live hub',
    /isLive\(hubState\)\?'<span class="status-dot"><\/span> Live session':'<span class="status-dot off"><\/span> This computer only'/.test(app));
  ok('a blank QR canvas is removed rather than shown',/qr-wrap'\)\?\.remove\(\)/.test(app));
  ok('the phone link embeds the service code exactly once',/function remoteUrl\(\)\{const origin=phoneOrigin\(\);return origin&&sessionCode\?origin\+'\/remote\?code='/.test(app)&&/drawQR\(full/.test(app));
  ok('the old copy-link fallback is visible',/Direct phone link/.test(app)&&/Open phone remote/.test(app)&&/Copy link/.test(app));
  ok('localhost without a discovered LAN address never gets a phone QR',/function phoneOrigin\(\)[\s\S]*?return a\?`http:\/\/\$\{a\}:[\s\S]*?:null/.test(app));
  ok('private IPv4 hubs are identified for same-Wi-Fi guidance',/function isPrivateIPv4Host\(\)/.test(app)&&/function isLocalHubHost\(\)/.test(app));
  ok('QR and direct phone link require a real code plus reachable origin',/const phoneUrl=sessionCode&&origin\?remoteUrl\(\):''/.test(app)&&/drawQR\(full/.test(app));
  ok('a retry control exists on the presenter card',/id="hubRetry"/.test(app)&&/id="hubRetry"/.test(app));
  ok('the phone remote can retry without reloading',/pairRetry/.test(remote));
  ok('the remote does not assume the hub is online',/let hubOnline=false/.test(remote)&&!/let hubOnline=true/.test(remote));
  ok('the remote requires a JSON body, not just a 2xx',/isJson/.test(remote));
  ok('wrong-code JSON errors still prove the phone reached the hub',/const appError=\[400,401\]\.includes\(r\.status\)/.test(remote));
  ok('a verse-not-found 404 is distinct from a static-host 404',/const verseMiss=.*Reference not found/.test(remote)&&/r\.status===404&&!verseMiss/.test(remote));
  ok('remote recovery differs for hosted hubs and private-LAN hubs',/This address does not have the live ministry service/.test(remote)&&/keep the phone on the same Wi-Fi/.test(remote));
  ok('hub-probe.js is loaded before app.js',html.indexOf('/hub-probe.js')<html.indexOf('/app.js'));

  console.log('\n--- saved service code survives a blip ---');
  {
    /* Regression: the old ensureSession() deleted kingdomCode on ANY failure, so a
       Wi-Fi blip orphaned every paired phone and a running vMix input. */
    ok('a stored code is retired only on an explicit 401',/response\.status===401\)rejected=true/.test(app));
    ok('a transport failure keeps and displays the stored code',/if\(!rejected\)\{sessionCode=known;return known\}/.test(app));
    ok('no session is minted without a live hub',/if\(!hub\(\)\.isLive\(hubState\)\)\{\s*sessionError=[^;]*;\s*return null/.test(app));
  }

  console.log('\n--- presenter navigation without a hub ---');
  {
    ok('prev/next fall back to a local canon walk',/if\(!hub\(\)\.isLive\(hubState\)\)return localStep\(d(,quiet)?\)/.test(app));
    ok('the local walker crosses book and chapter boundaries',
      /bi--;ch=books\[bi\]\.chapters/.test(app)&&/bi\+\+;ch=1/.test(app));
    ok('the local walker blocks at both ends of the canon',
      /Start of the Bible/.test(app)&&/End of the Bible/.test(app));
    ok('live-hub failures are returned for Voice Mode to report',/if\(!out\|\|out\.ok!==true\)[\s\S]*?return\{ok:false,error\}/.test(app));
  }

  console.log('\n--- the source must not hardcode a live claim ---');
  ok('no fake dashed placeholder service code is rendered',!app.includes("'------'"));
  ok('the old misleading LAN message is gone',!/No LAN address found/.test(app));
  ok('the old "sync is ready" claim is conditional',/Audience display sync is ready':'Audience display syncs on this computer only'/.test(app));

  console.log('\n--- live ministry hub doorway (single-site design) ---');
  {
    /* Render is the live ministry hub; Vercel is static. Keep the doorway in sync
       across server, probe, and app. */
    const serverSrc=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
    const probeSrc=fs.readFileSync(path.join(__dirname,'../public/hub-probe.js'),'utf8');
    const css=fs.readFileSync(path.join(__dirname,'../public/styles.css'),'utf8');
    ok('server exposes the live hub URL in premium config',/liveHubUrl/.test(serverSrc));
    ok('server live hub defaults to the Render ministry hub',
      serverSrc.includes('https://kingdom-bible.onrender.com'));
    ok('hub-probe exports the live hub URL',/LIVE_HUB_URL/.test(probeSrc)&&/LIVE_HUB_URL=/.test(probeSrc));
    ok('ministry renders the live doorway card with new-tab link',
      /liveHubCardHtml/.test(app)&&/Open Live Ministry Hub/.test(app)&&/target="_blank"/.test(app)
      &&/copyLiveHub/.test(app));
    ok('the live button carries ?source= into #ministry on the live stage',
      /function liveHubLink/.test(app)&&/source/.test(app)&&/#ministry/.test(app)
      &&/liveHubUrl\(\)\+q\+'#ministry'/.test(app));
    ok('the live button opens Render and gives wake-up guidance instead of a white screen',
      /function openLiveHub/.test(app)&&/window\.open\(url,'_blank'/.test(app)
      &&/Render ministry hub in a new tab/.test(app));
    ok('the live button is wired in the same row position (bindConnectCard)',
      /#openLiveHub/.test(app)&&/goLive\.onclick=openLiveHub/.test(app));
    ok('ministry never blanks on a failed verse fetch (white-screen guard)',
      /ministry verse failed, using fallback/.test(app)&&/DEVOTIONAL\.verse,ref:DEVOTIONAL\.scripture/.test(app));
    ok('the doorway resolves server config first, then probe, then fallback',
      /KingdomPremium\?\.config\?/.test(app)&&/LIVE_HUB_URL/.test(app));
    ok('the doorway has premium gold styling',/\.live-hub-card/.test(css));
    ok('README documents Render as the live ministry hub',
      fs.readFileSync(path.join(__dirname,'../README.md'),'utf8').includes('https://kingdom-bible.onrender.com'));
  }

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
