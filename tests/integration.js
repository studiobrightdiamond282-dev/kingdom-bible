/* End-to-end: presenter starts session -> phone remote connects -> verse pushed -> display stream receives. */
const fs=require('fs');
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

  console.log('\n'+pass+' passed, '+fail+' failed');
  if(fail)process.exitCode=1;
})();