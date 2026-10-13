/* KINGDOM BIBLE — Voice Preacher Mode (premium, hands-free presentation)
   ------------------------------------------------------------------
   The app listens to the preacher through the browser's speech recogniser
   (Web Speech API). The moment a Bible reference is spoken — "the book of
   John chapter one verse three" — the verse is resolved from the local
   Scripture library and pushed to the audience display in milliseconds.
   "Next verse", "previous verse", "blank screen", "show the verse" and
   "stop listening" work as spoken commands.

   Honesty rules, same spirit as hub-probe.js:
   - If SpeechRecognition does not exist (Firefox, some WebViews) the card
     says so and explains which browsers work. No fake listening state.
   - Speech capture needs a secure context (https:// or localhost). On a
     plain http:// LAN address the card explains that too.
   - Recognition accuracy belongs to the browser's speech service; we never
     promise 100%. What IS guaranteed: a recognised reference is resolved
     against the real canon (never hallucinated), and the confirm mode lets
     an operator approve each verse before it reaches the projector.

   app.js provides the hooks (present / gotoVerse / next / prev / blank /
   show / notify) when Ministry Mode renders. All reference understanding
   lives in bible-ref.js so it is unit-tested in Node. */
(function(g){
'use strict';
const SR=g.SpeechRecognition||g.webkitSpeechRecognition;
const LSV='kingdomVoice.v1';
const LANGS=[['en-US','English (US)'],['en-GB','English (UK)'],['en-NG','English (Nigeria)'],['en-GH','English (Ghana)'],['en-ZA','English (South Africa)'],['en-IN','English (India)'],['en-AU','English (Australia)']];
let hooks=null,rec=null,wantListen=false,starting=false,restartTimer=null,restartWait=60;
let meterCtx=null,meterStream=null,meterRAF=0;
let finalTail='',lastTailScan='',fuseTimer=null,pending={key:'',hit:null},dispatchKeys=new Set(),dispatchAt=new Map(),entries=[],entrySeq=0;
/* A short edge fuse lets the recogniser append a verse without making the
   preacher wait for a pause. Chapter-only references get a longer hold because
   the next frame often contains the verse. */
const FUSE_MS=350,CHAPTER_HOLD_MS=1100;
/* Chrome ends a recognition session on its own — on silence, and as a hard stop
   after roughly a minute. Every restart is dead air, and a reference spoken
   inside it is lost for good, so restart fast and back off only when the engine
   is genuinely busy. */
const RESTART_MS=60,RESTART_MAX_MS=800;
/* 'unknown' | 'on' | 'cloud' — which speech engine answered. See ensureOnDevice(). */
let engine='unknown',engineNote='';
const settings=Object.assign({lang:'en-US',auto:true,tr:'',numStyle:'chapter',deviceId:'',onDevice:true},load());
function load(){try{return JSON.parse(localStorage.getItem(LSV)||'{}')}catch{return{}}}
function persist(){try{localStorage.setItem(LSV,JSON.stringify(settings))}catch{}}
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const secure=()=>g.isSecureContext||['localhost','127.0.0.1'].includes(location.hostname);
const available=()=>!!SR&&secure();
const notify=(m,t)=>{if(hooks&&hooks.notify)hooks.notify(m,t)};

/* ---------- UI ---------- */
function cardHtml(){
  if(!SR)return `<section class="card voice-card" id="voiceCard">
    <div class="section-head" style="margin:0 0 10px"><div><div class="eyebrow">PREMIUM · HANDS-FREE</div><h2>Voice Preacher Mode</h2><p>Speak a reference — the verse appears on the audience display instantly.</p></div><span class="pill"><span class="status-dot off"></span> Not available in this browser</span></div>
    <div class="notice">This browser does not provide speech recognition. Open KINGDOM BIBLE in <strong>Google Chrome</strong> or <strong>Microsoft Edge</strong> on the ministry computer to use Voice Preacher Mode. Everything else keeps working here.</div>
  </section>`;
  if(!secure())return `<section class="card voice-card" id="voiceCard">
    <div class="section-head" style="margin:0 0 10px"><div><div class="eyebrow">PREMIUM · HANDS-FREE</div><h2>Voice Preacher Mode</h2><p>Speak a reference — the verse appears on the audience display instantly.</p></div><span class="pill"><span class="status-dot off"></span> Needs a secure page</span></div>
    <div class="notice">Browsers only allow microphone access on a secure page. Open this app at <strong>https://</strong> (the public website) or on <strong>http://localhost:4173</strong> on the ministry computer — a plain <code>http://192.168…</code> LAN address cannot use the microphone. The phone remote and presenter control still work here.</div>
  </section>`;
  const listening=wantListen;
  return `<section class="card voice-card" id="voiceCard">
  <div class="section-head" style="margin:0 0 10px">
    <div><div class="eyebrow">PREMIUM · HANDS-FREE</div><h2>Voice Preacher Mode</h2><p>The app listens to the sermon and projects every Bible reference the moment it is spoken.</p></div>
    <span class="pill ${listening?'premium-pill':''}" id="voiceStatus"><span class="status-dot${listening?'':' off'}"></span> ${listening?'Listening':'Ready'}</span>
  </div>
  <div class="voice-head">
    <button class="voice-mic${listening?' listening':''}" id="voiceMic" aria-label="${listening?'Stop':'Start'} voice listening" aria-pressed="${listening}">${listening?'◼':'🎙'}</button>
    <div style="flex:1;min-width:220px">
      <strong id="voiceHint">${listening?'Listening… preach naturally.':'Tap the microphone, allow access, then preach naturally.'}</strong>
      <p style="margin:4px 0 0;font-size:12px;color:var(--muted)">Say “John chapter three verse sixteen”, “First John 2 verse 5”, “Psalm 23 verse 1 to 3” — then “<em>next verse</em>”, “<em>previous verse</em>”, “<em>blank screen</em>”, “<em>show the verse</em>” or “<em>stop listening</em>”.</p>
    </div>
  </div>
  <div class="voice-transcript" id="voiceTranscript">${listening?'Listening…':'The live transcript appears here while listening.'}</div>
  <div class="voice-settings">
    <div class="field"><label>Translation</label><select id="voiceTr">
      <option value="" ${settings.tr===''?'selected':''}>Reader’s choice</option>
      <option value="kjv" ${settings.tr==='kjv'?'selected':''}>KJV</option>
      <option value="asv" ${settings.tr==='asv'?'selected':''}>ASV</option>
      <option value="web" ${settings.tr==='web'?'selected':''}>WEB</option>
    </select></div>
    <div class="field"><label>Accent / language</label><select id="voiceLang">${LANGS.map(l=>`<option value="${l[0]}" ${settings.lang===l[0]?'selected':''}>${l[1]}</option>`).join('')}</select></div>
    <div class="field"><label>Spoken numbers</label><select id="voiceNumStyle">
      <option value="chapter" ${settings.numStyle!=='split'?'selected':''}>“Genesis 13” is chapter 13</option>
      <option value="split" ${settings.numStyle==='split'?'selected':''}>“Genesis 13” is 1:3</option>
    </select></div>
    <div class="field"><label>Microphone</label><select id="voiceDevice"><option value="">System default</option></select></div>
    <label class="voice-toggle"><input type="checkbox" id="voiceAuto" ${settings.auto?'checked':''}> Send to the display instantly (untick to approve each verse first)</label>
  </div>
  <div class="voice-meter" aria-hidden="true"><span id="voiceMeterFill"></span><em id="voiceMeterHint">Mic level appears while listening — speak and watch for green movement.</em></div>
  <div class="voice-log" id="voiceLog">${logHtml()}</div>
  <div class="notice" style="margin-top:12px">Your voice is processed by this browser’s speech service (Chrome and Edge may use their online recognisers while listening). KINGDOM BIBLE stores no audio and sends nothing to its own servers. Recognised references are resolved only against the real Bible text — never guessed.</div>
</section>`;
}
function logHtml(){
  if(!entries.length)return '<div class="vlog">Detected references and commands will appear here.</div>';
  return entries.map(e=>`<div class="vlog ${e.cls||''}">${e.icon||''}<span>${esc(e.msg)}</span>${e.hit?`<button class="secondary-btn small-btn" data-vsend="${e.id}">Send</button>`:''}${e.ms!=null?`<span class="t">${e.ms} ms</span>`:''}</div>`).join('');
}
function addLog(msg,cls,ms,hit,icon,key){
  entries.unshift({id:++entrySeq,msg,cls,ms:ms==null?null:ms,hit:hit||null,key:key||'',icon:icon||''});
  entries=entries.slice(0,8);
  const el=$('#voiceLog');if(el)el.innerHTML=logHtml();
}
function setStatus(text,live){
  const el=$('#voiceStatus');
  if(el){el.className='pill '+(live?'premium-pill':'');el.innerHTML=`<span class="status-dot${live?'':' off'}"></span> ${esc(text)}`}
  const mic=$('#voiceMic');
  if(mic){mic.classList.toggle('listening',!!wantListen);mic.textContent=wantListen?'◼':'🎙';mic.setAttribute('aria-pressed',String(!!wantListen))}
  const hint=$('#voiceHint');
  if(hint)hint.textContent=wantListen?'Listening… preach naturally.':'Tap the microphone, allow access, then preach naturally.';
}
function setTranscript(fin,interim){
  const el=$('#voiceTranscript');if(!el)return;
  const f=(fin||'').trim(),i=(interim||'').trim();
  if(!f&&!i){el.textContent=wantListen?'Listening…':'The live transcript appears here while listening.';return}
  el.innerHTML=`<strong>${esc(f.slice(-140))}</strong> <em>${esc(i.slice(-120))}</em>`;
}

/* ---------- recognition ---------- */
function start(){
  if(!available()||wantListen)return;
  wantListen=true;
  finalTail='';lastTailScan='';clearPending();dispatchKeys.clear();
  restartWait=RESTART_MS;
  /* Kick off the on-device probe in parallel — listening must not wait on it. */
  ensureOnDevice().then(()=>{
    if(wantListen&&engine==='on'){try{if(rec)rec.processLocally=true}catch{}}
    if(engineNote&&wantListen)addLog(engineNote,'',null,null,'');
  });
  spin();
  setStatus('Listening',true);
  startMeter();refreshDevices();pokeNoResultWatch();
  addLog('Microphone on — listening for Scripture references','', null,null,'');
}
function spin(){
  if(!wantListen)return;
  if(starting&&rec)return;            /* never run two recognisers at once */
  starting=true;
  try{
    rec=new SR();
    rec.lang=settings.lang;
    rec.continuous=true;
    rec.interimResults=true;
    /* Five guesses per phrase: the parser (never a guesser) picks the first
       alternative that resolves against the real canon — cheap accuracy win
       for version names and spoken numbers. */
    try{rec.maxAlternatives=5}catch(e){try{rec.maxAlternatives=1}catch(e2){}}
    /* On-device recognition keeps the audio on the ministry computer. It is
       both faster and immune to a slow or busy church wifi mid-sentence.
       Chrome only accepts this once the language pack is present, so probe
       first; anything unsupported simply keeps the cloud engine. */
    if(engine==='on'){try{rec.processLocally=true}catch{}}
    rec.onresult=onResult;
    rec.onerror=onError;
    rec.onend=()=>{
      rec=null;starting=false;
      if(!wantListen)return;
      clearTimeout(restartTimer);
      restartTimer=setTimeout(spin,restartWait);
    };
    rec.onstart=()=>{restartWait=RESTART_MS};   /* a healthy start resets backoff */
    rec.start();
    /* Chrome throws if the previous session is still tearing down. Back off a
       little instead of hammering it. */
    restartWait=Math.min(restartWait*2,RESTART_MAX_MS);
  }catch(e){/* an older start still pending — retry shortly */
    starting=false;rec=null;
    clearTimeout(restartTimer);
    restartTimer=setTimeout(spin,Math.max(restartWait,RESTART_MS));
  }
}
/* Ask Chrome for the offline speech pack. Never blocks listening: if the pack
   is only downloading we keep using the cloud engine this service and pick the
   fast one up next time. */
function ensureOnDevice(){
  if(engine==='on')return Promise.resolve(true);
  if(engine==='cloud'||typeof SR.available!=='function')return Promise.resolve(false);
  engine='unknown';
  return Promise.resolve()
    .then(()=>SR.available({langs:[settings.lang],processLocally:true,quality:'dictation'}))
    .then(r=>{
      if(r==='available'){engine='on';return true}
      if(r==='downloadable'||r==='downloading'){
        engine='cloud';engineNote='Downloading offline speech…';
        try{Promise.resolve(SR.install({langs:[settings.lang],processLocally:true,quality:'dictation'}))
          .then(ok=>{if(ok){engineNote='Offline speech ready — it will be used next time'}}).catch(()=>{})}catch{}
        return false;
      }
      engine='cloud';return false;
    })
    .catch(()=>{engine='cloud';return false});
}
function stop(silent){
  wantListen=false;starting=false;clearTimeout(restartTimer);clearPending();stopMeter();stopNoResultWatch();
  if(rec){try{rec.onend=null;rec.stop()}catch{}rec=null}
  setStatus('Ready',false);setTranscript('','');
  if(!silent)addLog('Microphone off','');
}
/* Live input level: brief AnalyserNode probe, NOT a held stream. Holding a
   getUserMedia stream open for the whole sermon risks fighting Chrome's
   SpeechRecognition for exclusive mic access on Windows (audio-capture /
   silence with a dancing meter — exactly the reported symptom). Measure for
   ~5 seconds to prove the device is alive, then release it and let the
   recogniser own the mic alone. Any failure disables quietly. */
let meterStopTimer=null;
function stopMeter(){
  try{if(meterStopTimer){clearTimeout(meterStopTimer);meterStopTimer=null}}catch(e){}
  try{if(meterRAF){const cf=g.cancelAnimationFrame||(typeof cancelAnimationFrame!=='undefined'?cancelAnimationFrame:null);if(cf)cf(meterRAF)}}catch(e){}
  meterRAF=0;
  try{if(meterStream)meterStream.getTracks().forEach(t=>{try{t.stop()}catch(e2){}})}catch(e){}
  meterStream=null;
  try{if(meterCtx)meterCtx.close()}catch(e){}
  meterCtx=null;
  const f=$('#voiceMeterFill');if(f&&f.style)f.style.width='0%';
}
async function startMeter(){
  stopMeter();
  try{
    const md=(typeof navigator!=='undefined'&&navigator.mediaDevices)||null;
    if(!md||typeof md.getUserMedia!=='function')return;
    const constraints=settings.deviceId?{audio:{deviceId:{exact:settings.deviceId}}}:{audio:true};
    const stream=await md.getUserMedia(constraints);
    if(!wantListen){stream.getTracks().forEach(t=>{try{t.stop()}catch(e){}});return}
    meterStream=stream;
    const Ctx=g.AudioContext||g.webkitAudioContext;
    if(!Ctx){stopMeter();return}
    meterCtx=new Ctx();
    const src=meterCtx.createMediaStreamSource(stream);
    const an=meterCtx.createAnalyser();an.fftSize=512;
    src.connect(an);
    const buf=new Uint8Array(an.frequencyBinCount);
    let peak=0;
    const fill=$('#voiceMeterFill'),hint=$('#voiceMeterHint');
    const tick=()=>{
      if(!wantListen||!meterStream)return;
      an.getByteTimeDomainData(buf);
      let sum=0;
      for(let i=0;i<buf.length;i++){const v=(buf[i]-128)/128;sum+=v*v}
      const lvl=Math.min(1,Math.sqrt(sum/buf.length)*2.4);
      peak=Math.max(peak*0.92,lvl);
      if(fill&&fill.style){fill.style.width=Math.round(peak*100)+'%';fill.className=peak>0.75?'hot':peak>0.4?'warm':''}
      if(hint)hint.textContent=peak<0.05?'Level very low — move closer or check the microphone.':'Mic level live — releasing the meter now so the recogniser owns the mic.';
      const raf=g.requestAnimationFrame||(typeof requestAnimationFrame!=='undefined'?requestAnimationFrame:null);
      if(raf)meterRAF=raf(tick);
    };
    tick();
    /* Release after 5 s: level proven, mic handed back to the recogniser. */
    meterStopTimer=setTimeout(()=>{stopMeter();const h=$('#voiceMeterHint');if(h&&wantListen)h.textContent='Level checked — meter released so speech recognition owns the microphone.'},5000);
  }catch(e){}
}
async function refreshDevices(){
  const sel=$('#voiceDevice');
  const md=(typeof navigator!=='undefined'&&navigator.mediaDevices)||null;
  if(!sel||!md||typeof md.enumerateDevices!=='function')return;
  try{
    const all=await md.enumerateDevices();
    const ins=all.filter(d=>d.kind==='audioinput');
    const cur=sel.value||settings.deviceId||'';
    sel.innerHTML='<option value="">System default</option>'+ins.map((d,i)=>`<option value="${esc(d.deviceId||'')}">${esc(d.label||('Microphone '+(i+1)))}</option>`).join('');
    if(cur)sel.value=cur;
    if(!ins.length){
      const h=$('#voiceMeterHint');
      if(h)h.textContent='No microphone was found on this computer.';
    }
  }catch(e){}
}
function onError(e){
  const code=e&&e.error;
  if(code==='no-speech'||code==='aborted')return;
  if(code==='not-allowed'||code==='service-not-allowed'){
    stop(true);
    setStatus('Microphone blocked',false);
    addLog('Microphone access is blocked. Click the padlock in the address bar and allow the microphone for this site.','miss');
    notify('Microphone access is blocked for this site','error');
    return;
  }
  if(code==='network'){
    setStatus('Speech service unreachable',false);
    addLog('The browser’s speech service needs an internet connection (Chrome sends audio to Google for transcription). Check the connection — listening will keep retrying. Your en-NG accent setting is applied to that cloud service when it is reachable.','miss');
    return;
  }
  if(code==='audio-capture'){
    stop(true);setStatus('No microphone found',false);
    addLog('No microphone was found on this computer.','miss');
  }
  if(code==='language-not-supported'||code==='not-supported'){
    stop(true);setStatus('Accent not supported',false);
    addLog('This accent (“'+settings.lang+'”) is not supported by the browser’s speech service here. Switch Accent to English (US) and try again.','miss');
    notify('Accent not supported — switched suggestion: English (US)','error');
  }
}
/* No-result watchdog: if the recogniser runs 12 s with zero results while the
   meter proved the mic is alive, the engine is stalled (cloud unreachable,
   language unsupported, or a zombie session). Say so honestly instead of a
   silent red dot. Reset on every result. */
let noResultTimer=null,lastResultAt=0;
function stopNoResultWatch(){try{if(noResultTimer){clearTimeout(noResultTimer);noResultTimer=null}}catch(e){}}
function pokeNoResultWatch(){
  lastResultAt=Date.now();
  stopNoResultWatch();
  try{
    noResultTimer=setTimeout(()=>{
      if(!wantListen)return;
      if(Date.now()-lastResultAt<11000)return;
      addLog('Listening but hearing no words for 12 s — the mic has level, so the browser’s speech service is not returning text. Check: 1) internet (Chrome transcribes online), 2) Windows Settings → Sound → Input is the same mic, 3) Accent English (US) as a test. Listening continues.','miss');
      const h=$('#voiceMeterHint');if(h)h.textContent='Mic has level but no words arrived — see the log for the 3 checks.';
    },12000);
  }catch(e){}
}
function onResult(e){
  let interim='',finals='';
  try{pokeNoResultWatch()}catch(err){}
  const altTexts=r=>{
    /* Every recognition alternative in confidence order; the canon parser is
       the judge, so a wrong guess can never reach the display. */
    const out=[];
    try{
      const n=(r&&typeof r.length==='number')?r.length:0;
      for(let j=0;j<n&&j<5;j++){const t=r[j]&&r[j].transcript;if(t)out.push(t)}
    }catch(e){}
    if(!out.length&&r[0]&&r[0].transcript)out.push(r[0].transcript);
    return out;
  };
  for(let i=e.resultIndex;i<e.results.length;i++){
    const r=e.results[i],alts=altTexts(r);
    const best=alts[0]||'';
    if(r.isFinal)finals+=best+' ';
    else interim+=best+' ';
    try{r._alts=alts}catch(e){}
  }
  if(finals.trim())finalTail=(finalTail+' '+finals).slice(-240);
  setTranscript(finalTail,interim);
  /* SpeechRecognition can deliver a final result and a newer interim result
     in the same event. Scan both: interim frames are not a preview to ignore,
     they are the earliest usable Scripture signal. */
  if(finals.trim())handleSegment(finals,true,collectAlts(e,0,true));
  if(interim.trim()){handleSegment(interim,false,collectAlts(e,0,false));lastTailScan=finalTail}
  /* A reference can straddle a recogniser restart: "the book of" lands in the
     last session and "John three sixteen" opens the next one. Re-scan the tail
     only when it actually changed, so an idle frame costs nothing. */
  else if(finalTail.trim()&&finalTail!==lastTailScan){handleSegment(finalTail,false,null);lastTailScan=finalTail}
  function collectAlts(e,from,isFinal){
    const out=[];
    for(let i=from;i<e.results.length;i++){
      const r=e.results[i];
      if(!!r.isFinal!==!!isFinal)continue;
      const alts=r._alts||(r[0]&&r[0].transcript?[r[0].transcript]:[]);
      for(const t of alts){if(t&&out.indexOf(t)<0)out.push(t);if(out.length>=5)break}
      if(out.length>=5)break;
    }
    return out;
  }
}
function clearPending(){
  if(fuseTimer){clearTimeout(fuseTimer);fuseTimer=null}
  pending={key:'',hit:null};
}
function keyFor(hit){
  /* The book must be part of a contextual verse's key: without it "Jude verse 5"
     and "Philemon verse 5" collide on 'v:5:' and the second is swallowed as a
     duplicate of the first. */
  if(hit.ctx||hit.type==='verse')return 'v:'+(hit.book==null?'':hit.book)+':'+hit.verse+':'+(hit.verseEnd||'');
  return ['r',hit.book,hit.chapter,hit.verse,hit.verseEnd].join(':');
}
function schedule(hit,key,delay){
  /* Repeated interim frames for the same edge reference must not keep moving
     the fuse. A new, more complete reference replaces the old candidate. */
  if(pending.key===key&&fuseTimer)return;
  clearPending();
  pending={key,hit};
  fuseTimer=setTimeout(()=>{
    fuseTimer=null;
    const next=pending;
    pending={key:'',hit:null};
    if(next.hit)dispatch(next.hit,next.key);
  },delay);
}
function handleSegment(text,isFinal,alts){
  if(!hooks||!g.KingdomRef)return;
  const list=(Array.isArray(alts)&&alts.length?[text].concat(alts):[text]).filter(Boolean);
  const firstCmd=items=>{
    for(const t of items){const c=g.KingdomRef.command(t);if(c)return c}
    return null;
  };
  const firstScan=items=>{
    for(const t of items){
      const h=g.KingdomRef.scan(t,hooks.books,{numberStyle:settings.numStyle});
      if(h){try{h._text=t}catch(e){}return h}
    }
    return null;
  };
  try{
    const known=(hooks&&hooks.translations)||['kjv','asv','web'];
    for(const t of list){
      const det=g.KingdomRef.detectVersion;
      const v=(typeof det==='function')?det(t,known):null;
      if(v&&v!==settings.tr){settings.tr=v;persist();const tr=$('#voiceTr');if(tr)tr.value=v;notify('Voice translation: '+v.toUpperCase());addLog('Voice translation switched to '+v.toUpperCase(),'hit',null,null,'◈')}
      if(v)break;
    }
  }catch(e){}
  /* Commands must win on EVERY frame, not only finals: "next verse" spoken as
     an interim fragment ("next…" then "…verse") must step immediately, the way
     verse references already do. References and commands never collide — a
     command frame holds no book name — so checking commands first is safe. */
  const cmdNow=firstCmd(list);
  if(cmdNow)return runCommand(cmdNow);
  /* scan() is intentionally called for every interim frame. A complete
     book+chapter+verse followed by more words is safe to dispatch now; waiting
     for isFinal made Voice Mode lag until the preacher paused. */
  const hit=firstScan(list);
  if(!hit)return;
  try{
    if(hit.book!=null&&hooks.warmBook)hooks.warmBook(settings.tr,hit.book);
    else if(hooks.warm)hooks.warm(settings.tr);
  }catch(e){}
  const key=keyFor(hit);
  /* Memory that stays active: a verse repeats during teaching ("Joshua 1:1…
     Joshua 1:1 again"). The lock expires after 6 s so re-calling a verse
     re-displays it, while same-frame duplicates still can't double-fire. */
  if(dispatchKeys.has(key)){
    const age=Date.now()-(dispatchAt.get(key)||0);
    if(age<6000){clearPending();return}
    dispatchKeys.delete(key);dispatchAt.delete(key);
  }
  if(hit.type==='ref'&&hit.verse==null){
    schedule(hit,key,CHAPTER_HOLD_MS);
    return;
  }
  if(hit.type==='verse'){
    /* "…now verse 25" — jump within the passage already on the display. */
    if(hit.atEnd!==false)schedule({...hit,ctx:true},key,FUSE_MS);
    else{clearPending();dispatch({...hit,ctx:true},key)}
    return;
  }
  /* Complete verse mid-sentence ("Joshua 1:1 says…") fires NOW — waiting for
     a pause is what made verses feel dead. A verse at the very edge of the
     frame ("…Joshua 1:1" with nothing after) keeps its 350 ms fuse so a
     following verse number can still join it. */
  if(hit.atEnd===false){clearPending();dispatch(hit,key)}
  else schedule(hit,key,FUSE_MS);
}
function dispatch(hit,key){
  /* Lock before any async resolver/display work. The recogniser commonly emits
     the same verse again while the first send is still in flight. */
  if(key&&dispatchKeys.has(key))return;
  if(key){dispatchKeys.add(key);try{dispatchAt.set(key,Date.now())}catch(e){}}
  if(!settings.auto){
    const label=hit.ctx?('verse '+hit.verse+(hit.verseEnd?'-'+hit.verseEnd:'')):(g.KingdomRef.format(hit,hooks.books)||'reference');
    addLog('Heard “'+label+'” — approve to send',' ',null,hit,'',key);
    return;
  }
  fire(hit,key);
}
function fire(hit,key){
  /* Manual approval normally arrives with a key already locked by dispatch().
     Keep this guard for direct callers so every path has dispatch-time locking. */
  key=key||keyFor(hit);
  if(key&&!dispatchKeys.has(key)){dispatchKeys.add(key);try{dispatchAt.set(key,Date.now())}catch(e){}}
  const started=(g.performance&&performance.now)?performance.now():Date.now();
  const done=v=>{
    if(v&&v.ref){
      const ms=Math.round(((g.performance&&performance.now)?g.performance.now():Date.now())-started);
      addLog(v.ref+' sent to the display','hit',ms,null,'▣');
    }else addLog('Heard a reference but it is outside this chapter — nothing was sent','miss');
  };
  const p=hit.ctx?hooks.gotoVerse(hit.verse,hit.verseEnd,settings.tr,hit.book==null?null:hit.book):hooks.present(hit,settings.tr);
  Promise.resolve(p).then(done).catch(()=>done(null));
}

function runCommand(cmd){
  if(cmd==='stop'){stop();notify('Voice listening stopped');return}
  const label={next:'Next verse',prev:'Previous verse',blank:'Screen blanked',show:'Verse restored'}[cmd];
  const fn={next:hooks.next,prev:hooks.prev,blank:hooks.blank,show:hooks.show}[cmd];
  if(!fn)return;
  Promise.resolve(fn()).then(()=>addLog('▶ '+label+' (voice command)','hit',null,null,'◆')).catch(()=>{});
}

/* ---------- wiring (called every time Ministry Mode renders) ---------- */
function bind(h){
  hooks=h;
  const mic=$('#voiceMic');
  if(mic)mic.onclick=()=>{wantListen?stop():start()};
  const tr=$('#voiceTr');if(tr)tr.onchange=e=>{settings.tr=e.target.value;persist();if(hooks.warm)hooks.warm(settings.tr)};
  const lang=$('#voiceLang');if(lang)lang.onchange=e=>{settings.lang=e.target.value;persist();engine='unknown';engineNote='';if(wantListen){/* apply the new language live */if(rec){try{rec.onend=null;rec.stop()}catch{}rec=null;starting=false}ensureOnDevice();spin()}};
  const auto=$('#voiceAuto');if(auto)auto.onchange=e=>{settings.auto=!!e.target.checked;persist()};
  const num=$('#voiceNumStyle');if(num){num.value=settings.numStyle||'chapter';num.onchange=e=>{settings.numStyle=(e.target.value==='split')?'split':'chapter';persist();notify(settings.numStyle==='split'?'Spoken numbers: “Genesis 13” reads as 1:3':'Spoken numbers: “Genesis 13” reads as chapter 13')}};
  const dev=$('#voiceDevice');if(dev){refreshDevices();dev.onchange=e=>{settings.deviceId=e.target.value||'';persist();if(wantListen)startMeter();notify(settings.deviceId?'Microphone preference saved — also set this mic as the OS default input so the recogniser hears it.':'Using the system default microphone.')}};
  const logEl=$('#voiceLog');
  if(logEl)logEl.onclick=e=>{
    const b=e.target.closest('[data-vsend]');if(!b)return;
    const entry=entries.find(x=>String(x.id)===b.dataset.vsend);
    if(entry&&entry.hit){fire(entry.hit,entry.key);entry.hit=null;logEl.innerHTML=logHtml()}
  };
  /* a re-render must reflect the true module state, never reset it */
  setStatus(wantListen?'Listening':'Ready',wantListen);
}

g.KingdomVoice={supported:available,cardHtml,bind,start,stop,listening:()=>wantListen,
  engine:()=>engine,prepare:ensureOnDevice,settings};
})(typeof window!=='undefined'?window:globalThis);
