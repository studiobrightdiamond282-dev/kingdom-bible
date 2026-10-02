/* End-to-end: presenter starts session -> phone remote connects -> verse pushed -> display stream receives. */
const fs=require('fs'),path=require('path');
const B='http://localhost:'+(process.env.PORT||4173);
const j=async(p,o)=>{const r=await fetch(B+p,o);let d={};try{d=await r.json()}catch{}return{status:r.status,body:d}};
const post=(p,b)=>j(p,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b||{})});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
/* the encoder the presenter page draws with, so the QR we assert on is the real one */
global.window={};global.TextEncoder=require('util').TextEncoder;
require('../public/qr.js');
const QR=global.window.QR;

(async()=>{
  let pass=0,fail=0;
  const ok=(name,cond,extra)=>{if(cond){pass++;console.log('  PASS',name)}else{fail++;console.log('  FAIL',name,extra||'')}};

  console.log('\n--- ministry session flow ---');
  const net=await j('/api/network');
  ok('network endpoint reports a LAN address',net.body.addresses&&net.body.addresses.length>0,JSON.stringify(net.body));

  const start=await post('/api/session/start');
  ok('session starts and returns a 6-char code',/^[A-Z0-9]{4,6}$/.test(start.body.code||''),start.body.code);
  const code=start.body.code;

  const bad=await post('/api/session/status',{code:'WRONG1'});
  ok('wrong code is rejected with 401',bad.status===401,'status '+bad.status);

  const good=await post('/api/session/status',{code});
  ok('correct code unlocks the session',good.status===200&&good.body.ok===true);
  ok('remote URL points at the LAN address',typeof start.body.url==='string'&&/^http:\/\/\d+\.\d+\.\d+\.\d+:\d+$/.test(start.body.url),start.body.url);

  // phone looks up a verse and pushes it
  const v=await j('/api/verse?ref='+encodeURIComponent('John 3:16'));
  ok('phone can resolve a verse server-side',v.status===200&&/^For God so loved/.test(v.body.text||''),v.body.text);
  const push=await post('/api/remote/action',{code,action:{type:'presentation',payload:{
    ref:v.body.ref,label:v.body.label,text:v.body.text,verses:v.body.verses,
    book:v.body.book,chapter:v.body.chapter,verse:v.body.verse,verseEnd:v.body.verseEnd,
    translation:'kjv',theme:'royal',church:'KINGDOM BIBLE',blank:false}}});
  ok('phone pushes a verse to the live session',push.status===200&&push.body.ok===true);

  const st=await j('/api/state');
  ok('display state reflects the pushed verse',st.body.presentation&&st.body.presentation.ref==='John 3:16',st.body.presentation&&st.body.presentation.ref);

  // display (SSE) must receive it
  const ctrl=new AbortController();
  const es=await fetch(B+'/api/stream?code='+code,{signal:ctrl.signal});
  ok('display stream opens for a valid code',es.status===200&&/event-stream/.test(es.headers.get('content-type')||''),es.status);
  const reader=es.body.getReader();
  const dec=new TextDecoder();
  let buf='';
  /* drain frames until the target reference shows up (or we time out) */
  const readUntil=async needle=>{
    const deadline=Date.now()+4000;
    while(Date.now()<deadline){
      if(buf.includes(needle))return true;
      const remaining=deadline-Date.now();
      if(remaining<=0)break;
      const timer=setTimeout(()=>ctrl.abort(),remaining);
      try{const{value,done}=await reader.read();if(done)break;buf+=dec.decode(value,{stream:true})}
      catch{break}
      finally{clearTimeout(timer)}
    }
    return buf.includes(needle);
  };
  const ps=await j('/api/verse?ref=Ps+23:1');
  await post('/api/remote/action',{code,action:{type:'presentation',payload:{
    ref:ps.body.ref,text:ps.body.text,verses:ps.body.verses,
    book:ps.body.book,chapter:ps.body.chapter,verse:ps.body.verse,verseEnd:ps.body.verseEnd,
    translation:'kjv',theme:'light',church:'KINGDOM BIBLE',blank:false}}});
  const gotFrame=await readUntil('Psalms 23:1');
  ctrl.abort();
  ok('display receives a live presentation frame',gotFrame&&/event: presentation/.test(buf),buf.slice(0,200).replace(/\n/g,'|'));

  const esBad=await fetch(B+'/api/stream?code=NOPE00');
  ok('display stream rejects an invalid code',esBad.status===401,'status '+esBad.status);

  console.log('\n--- phone remote navigation ---');
  const nx=await post('/api/remote/action',{code,action:{type:'next'}});
  const after=await j('/api/state');
  ok('next advances one verse',nx.body.ok===true&&after.body.presentation.ref==='Psalms 23:2',after.body.presentation.ref);
  const nx2=await post('/api/remote/action',{code,action:{type:'next'}});
  const after2=await j('/api/state');
  ok('next advances again',nx2.body.ok===true&&after2.body.presentation.ref==='Psalms 23:3',after2.body.presentation.ref);
  const pv=await post('/api/remote/action',{code,action:{type:'prev'}});
  const back=await j('/api/state');
  ok('prev steps back',pv.body.ok===true&&back.body.presentation.ref==='Psalms 23:2',back.body.presentation.ref);
  const bl=await post('/api/remote/action',{code,action:{type:'blank',blank:true}});
  const blanked=await j('/api/state');
  ok('blank toggles the display',bl.body.ok===true&&blanked.body.presentation.blank===true);
  const unauth=await post('/api/remote/action',{code:'BADCOD',action:{type:'blank',blank:true}});
  ok('unauthorised remote is rejected',unauth.status===401,'status '+unauth.status);

  console.log('\n--- canon boundaries ---');
  const endV=await j('/api/verse?ref=Rev+22:21');
  await post('/api/remote/action',{code,action:{type:'presentation',payload:{ref:endV.body.ref,text:endV.body.text,
    book:endV.body.book,chapter:endV.body.chapter,verse:endV.body.verse,translation:'kjv',blank:false}}});
  const past=await post('/api/remote/action',{code,action:{type:'next'}});
  ok('next is blocked at the end of the Bible',past.status===400&&/End of Bible/.test(past.body.error||''),past.body.error);
  const startV=await j('/api/verse?ref=Gen+1:1');
  await post('/api/remote/action',{code,action:{type:'presentation',payload:{ref:startV.body.ref,text:startV.body.text,
    book:startV.body.book,chapter:startV.body.chapter,verse:startV.body.verse,translation:'kjv',blank:false}}});
  const before=await post('/api/remote/action',{code,action:{type:'prev'}});
  ok('prev is blocked at the start of the Bible',before.status===400&&/Start of Bible/.test(before.body.error||''),before.body.error);

  console.log('\n--- reference parsing ---');
  for(const [ref,want] of [['John 3:16','John 3:16'],['Jn 3:16','John 3:16'],['1Cor 13:4','1 Corinthians 13:4'],
                           ['ps 23:1','Psalms 23:1'],['Rev 22:21','Revelation 22:21'],['song 8:6','Song of Solomon 8:6']]){
    const r=await j('/api/verse?ref='+encodeURIComponent(ref));
    ok('parse "'+ref+'" -> '+want,r.status===200&&r.body.ref===want,r.body.ref||'not found');
  }
  const range=await j('/api/verse?ref='+encodeURIComponent('John 3:16-18'));
  ok('range John 3:16-18 returns 3 verses',range.status===200&&range.body.verses.length===3,range.body.verses&&range.body.verses.length);
  const chapter=await j('/api/verse?ref=John+3');
  ok('chapter John 3 returns verses',chapter.status===200&&chapter.body.verses.length>20,chapter.body.verses&&chapter.body.verses.length);
  const missing=await j('/api/verse?ref=zzz+1:1');
  ok('unknown reference returns 404',missing.status===404,'status '+missing.status);

  console.log('\n--- presenter connect code ---');
  {
    const addr=net.body.addresses[0];
    const remoteUrl=`http://${addr}:${net.body.port}/remote`;
    const qrTarget=remoteUrl+'?code='+encodeURIComponent(code);
    const out=QR(qrTarget);
    console.log('  QR encodes: '+qrTarget+'  ('+out.size+'x'+out.size+', version '+((out.size-17)/4)+')');
    ok('QR target uses the LAN address, not localhost',/^http:\/\/\d+\.\d+\.\d+\.\d+:\d+\/remote/.test(qrTarget),qrTarget);
    ok('QR target carries the live service code',qrTarget.endsWith('?code='+code));
    const presentUrl=`http://${addr}:${net.body.port}/present?code=${code}`;
    ok('vMix browser-source URL is well formed',/^http:\/\/\d+\.\d+\.\d+\.\d+:\d+\/present\?code=[A-Z0-9]{4,6}$/.test(presentUrl),presentUrl);
    const pres=await fetch(B+'/present?code='+code);
    const presHtml=await pres.text();
    /* /present serves the app shell, which renders the capture stage from JS */
    ok('display page is served for the vMix input',
      pres.status===200&&/\/app\.js/.test(presHtml)&&/renderPresentation/.test(fs.readFileSync(__dirname+'/../public/app.js','utf8')),
      'status '+pres.status);
    const rem=await fetch(B+'/remote?code='+code);
    ok('phone remote page is served',rem.status===200&&/Ministry Remote/i.test(await rem.text()));
    console.log('\n  vMix  : '+presentUrl);
    console.log('  Phone : '+qrTarget);
    console.log('  Code  : '+code);
  }

console.log('\n--- hub hardening ---');
  {
    /* the pairing code is the LAN-wide secret: it must never be readable without it */
    const netBody=(await j('/api/network')).body;
    ok('discovery does not leak the service code',netBody.code===undefined,JSON.stringify(netBody));
    const pubState=(await j('/api/state')).body;
    ok('public state does not leak the service code',pubState.session&&pubState.session.code===null,JSON.stringify(pubState.session));
    const authed=(await post('/api/session/status',{code})).body;
    ok('authenticated status does return the code',authed.session&&authed.session.code===code);
    /* /status.js and the README both promise this route exists */
    const h=await j('/health');
    ok('GET /health answers without secrets',h.status===200&&h.body.ok===true&&h.body.presentation==='operational',JSON.stringify(h.body));
    ok('health response carries no code or stack trace',!/\bcode\b|stack/i.test(JSON.stringify(h.body)),JSON.stringify(h.body));
    /* re-presenting the same code must not rotate it and orphan paired phones */
    const again=await post('/api/session/start',{pin:code});
    ok('restarting with the same code keeps it stable',again.body.code===code,again.body.code);
    const stillOk=await post('/api/session/status',{code});
    ok('previous pairing survives a ministry page reload',stillOk.status===200);
    /* a genuinely new code must still rotate */
    const rotated=await post('/api/session/start',{pin:'NEW777'});
    ok('a new pin rotates the session',rotated.body.code==='NEW777',rotated.body.code);
    await post('/api/session/start',{pin:code});
  }

  console.log('\n--- presentation fit + capture guards ---');
  {
    const appSrc=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
    /* regression: the old linear loop floored at 18px, so chapter-length passages
       overflowed the capture frame (seen as John 10 running off a projector). */
    ok('auto-fit uses a binary search, not a fixed 18px floor',
      /binary search/i.test(appSrc)&&!/>18\{px-=2/.test(appSrc));
    ok('auto-fit re-runs when the capture window resizes',/addEventListener\('resize'/.test(appSrc));
    /* regression: the link dot used to render into the vMix output */
    ok('status dot is opt-in via ?debug=1',/is-debug/.test(appSrc));
    /* regression: presenter buttons used a code-less, localhost-only /present */
    ok('display URL carries the LAN origin and live code',
      /function displayUrl\(\)\{return lanOrigin\(\)\+'\/present'\+/.test(appSrc)&&/\?code='\+encodeURIComponent\(sessionCode\)/.test(appSrc));
    ok('presenter no longer opens a bare /present',
      !/window\.open\('\/present'/.test(appSrc)&&!/location\.origin\+'\/present'/.test(appSrc));
    /* regression: "King James Version".split(' ').slice(-1)[0] rendered "VERSION" */
    const remoteSrc=fs.readFileSync(path.join(__dirname,'../public/remote.js'),'utf8');
    ok('remote translation badge uses short labels',/trLabel\(p\.translation\)/.test(remoteSrc)
      &&!/split\(' '\)\.slice\(-1\)\[0\]/.test(remoteSrc));
    ok('remote explains an offline hub instead of showing HTTP 404',/hubOffline/.test(remoteSrc));
  }

  console.log('\n--- static deployment contract ---');
  {
    /* Vercel serves public/ only; the SPA rewrites must keep every route reachable */
    const v=JSON.parse(fs.readFileSync(path.join(__dirname,'../vercel.json'),'utf8'));
    const routes=v.rewrites.map(r=>r.destination);
    ok('vercel routes /present, /remote and /status',['/index.html','/remote.html','/status.html'].every(d=>routes.includes(d)),
      JSON.stringify(routes));
    const al=JSON.parse(fs.readFileSync(path.join(__dirname,'../public/.well-known/assetlinks.json'),'utf8'));
    ok('assetlinks.json is valid JSON with the android_app relation',
      Array.isArray(al)&&al[0].target.namespace==='android_app'&&/^app\.kingdombible\.app$/.test(al[0].target.package_name));
    ok('assetlinks.json carries no placeholder string',
      !/REPLACE_WITH|TODO|YOUR_/.test(JSON.stringify(al)),JSON.stringify(al));
    ok('assetlinks helper exists',fs.existsSync(path.join(__dirname,'../scripts/assetlinks.js')));
  }

  console.log('\n'+pass+' passed, '+fail+' failed');
  console.log('\n'+pass+' passed, '+fail+' failed');
  if(fail)process.exitCode=1;
})();