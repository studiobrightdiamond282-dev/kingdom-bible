#!/usr/bin/env node
'use strict';
/* Studio voice contract: auth gate, quota accounting, WAV delivery, cache-hit
   accounting and the unconfigured-key 503. TTS_API_KEY=TEST_KEY makes the
   server answer with wrapped silence, so no billed Gemini call is ever made. */
const assert=require('assert'),{spawn}=require('child_process'),fs=require('fs'),os=require('os'),path=require('path');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function start(port,env){
  const store=path.join(os.tmpdir(),'kingdom-bible-tts-'+port+'.json');
  /* Remove any leftover store from a previous run — otherwise a re-run hits 409
     "already registered" on an email the crashed run created. */
  try{fs.rmSync(store,{force:true})}catch{}
  /* Same for the TTS disk cache — a leftover cache hit would silently skip the
     allowance accounting the assertions below verify. */
  try{fs.rmSync(path.join(os.tmpdir(),'tts-cache'),{recursive:true,force:true})}catch{}
  const child=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:String(port),ADMIN_PASSWORD:'test-admin-password',PREMIUM_STORE_PATH:store,PAYSTACK_SECRET_KEY:'',AI_API_KEY:'',...env},stdio:['ignore','pipe','pipe']});
  return{child,base:'http://127.0.0.1:'+port,store};
}
async function ready(base){for(let i=0;i<40;i++){try{const x=await fetch(base+'/health');if(x.ok)return}catch{}await wait(50)}throw Error('tts test server did not start')}
async function request(base,p,o={}){const r=await fetch(base+p,{...o,headers:{'content-type':'application/json',...(o.headers||{})}});const raw=r.headers.getSetCookie?r.headers.getSetCookie():[r.headers.get('set-cookie')];const cookie=raw[0]||'';const buf=Buffer.from(await r.arrayBuffer());let body={};try{body=JSON.parse(buf.toString('utf8'))}catch{}return{r,body,buf,session:(String(cookie).match(/kb_session=[^;]+/)||[''])[0]}}
(async()=>{try{
  const live=start(4197,{TTS_API_KEY:'TEST_KEY'});await ready(live.base);
  /* Anonymous callers must never reach the synthesiser — no key, no audio. */
  const anon=await request(live.base,'/api/speak',{method:'POST',body:JSON.stringify({text:'In the beginning.'})});
  assert.equal(anon.r.status,401,'/api/speak must require a signed-in account');
  /* A signed-in trial account gets a real WAV with a valid RIFF header. */
  const reg=await request(live.base,'/api/auth/register',{method:'POST',body:JSON.stringify({email:'t@example.com',password:'password-t',name:'T'})});
  assert.equal(reg.r.status,201);assert(reg.session,'registration must return a session cookie');
  const bad=await request(live.base,'/api/speak',{method:'POST',headers:{cookie:reg.session},body:JSON.stringify({})});
  assert.equal(bad.r.status,400,'empty text must be refused');
  const speak=await request(live.base,'/api/speak',{method:'POST',headers:{cookie:reg.session},body:JSON.stringify({text:'For God so loved the world, that he gave his only Son.'})});
  assert.equal(speak.r.status,200,'a signed-in request must be served: '+JSON.stringify(speak.body));
  assert.equal(speak.r.headers.get('content-type'),'audio/wav','/api/speak must answer with audio/wav');
  const wav=speak.buf;
  assert(wav.length>44,'a WAV with a 44-byte header must arrive');assert.equal(wav.toString('ascii',0,4),'RIFF');assert.equal(wav.toString('ascii',8,12),'WAVE');
  /* One fresh chunk was charged to the trial allowance (20/month). */
  assert.equal(speak.r.headers.get('x-tts-remaining'),'19','the trial allowance must be charged per generated chunk');
  /* The very same text again must be a free cache hit — no double charging. */
  const again=await request(live.base,'/api/speak',{method:'POST',headers:{cookie:reg.session},body:JSON.stringify({text:'For God so loved the world, that he gave his only Son.'})});
  assert.equal(again.r.status,200);assert.equal(again.r.headers.get('x-tts-remaining'),'19','a cache hit must not consume allowance');
  /* A chapter-sized text is chunked at sentence boundaries and still served. */
  const longText=Array.from({length:8},(_,i)=>`Verse ${i+1}. The Lord is my shepherd; I shall not want. He maketh me to lie down in green pastures.`).join(' ');
  const chapter=await request(live.base,'/api/speak',{method:'POST',headers:{cookie:reg.session},body:JSON.stringify({text:longText})});
  assert.equal(chapter.r.status,200,'a chapter-sized request must be chunked and served');
  /* With no key configured the feature must refuse cleanly, not crash. */
  const off=start(4198,{TTS_API_KEY:''});await ready(off.base);
  const reg2=await request(off.base,'/api/auth/register',{method:'POST',body:JSON.stringify({email:'u@example.com',password:'password-u',name:'U'})});
  const refused=await request(off.base,'/api/speak',{method:'POST',headers:{cookie:reg2.session},body:JSON.stringify({text:'Hello.'})});
  assert.equal(refused.r.status,503,'an unconfigured key must produce a clean 503');
  /* Static contracts: the browser must never see a key, and the WAV wrapper
     plus the /api/speak route must exist in the shipped source. */
  const srv=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8'),app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  assert(srv.includes('pcmToWav'),'the server must wrap raw Gemini PCM in a WAV header');
  assert(srv.includes("responseModalities:['AUDIO']"),'Gemini TTS must request the AUDIO response modality');
  assert(app.includes('/api/speak'),'the reader must call the hub proxy, never Gemini directly');
  assert(!app.includes('GEMINI')&&!app.includes('TTS_API_KEY'),'no Gemini credential or key name may appear in browser code');
  live.child.kill();off.child.kill();
  console.log('tts contract: OK');process.exit(0);
}catch(e){console.error('tts contract FAILED:',e);process.exit(1)}})();
