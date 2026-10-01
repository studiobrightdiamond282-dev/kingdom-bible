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
let hooks=null,rec=null,wantListen=false,starting=false,restartTimer=null;
let finalTail='',pending={key:'',n:0},lastSent={key:'',at:0},entries=[],entrySeq=0;
const settings=Object.assign({lang:'en-US',auto:true,tr:''},load());
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
    <label class="voice-toggle"><input type="checkbox" id="voiceAuto" ${settings.auto?'checked':''}> Send to the display instantly (untick to approve each verse first)</label>
  </div>
  <div class="voice-log" id="voiceLog">${logHtml()}</div>
  <div class="notice" style="margin-top:12px">Your voice is processed by this browser’s speech service (Chrome and Edge may use their online recognisers while listening). KINGDOM BIBLE stores no audio and sends nothing to its own servers. Recognised references are resolved only against the real Bible text — never guessed.</div>
</section>`;
}
function logHtml(){
  if(!entries.length)return '<div class="vlog">Detected references and commands will appear here.</div>';
  return entries.map(e=>`<div class="vlog ${e.cls||''}">${e.icon||''}<span>${esc(e.msg)}</span>${e.hit?`<button class="secondary-btn small-btn" data-vsend="${e.id}">Send</button>`:''}${e.ms!=null?`<span class="t">${e.ms} ms</span>`:''}</div>`).join('');
}
function addLog(msg,cls,ms,hit,icon){
  entries.unshift({id:++entrySeq,msg,cls,ms:ms==null?null:ms,hit:hit||null,icon:icon||''});
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
  finalTail='';pending={key:'',n:0};
  spin();
  setStatus('Listening',true);
  addLog('Microphone on — listening for Scripture references','', null,null,'');
}
function spin(){
  if(!wantListen)return;
  try{
    rec=new SR();
    rec.lang=settings.lang;
    rec.continuous=true;
    rec.interimResults=true;
    rec.maxAlternatives=1;
    rec.onresult=onResult;
    rec.onerror=onError;
    rec.onend=()=>{rec=null;if(wantListen){clearTimeout(restartTimer);restartTimer=setTimeout(spin,250)}};
    rec.start();
  }catch(e){/* an older start still pending — retry shortly */
    clearTimeout(restartTimer);restartTimer=setTimeout(spin,500);
  }
}
function stop(silent){
  wantListen=false;clearTimeout(restartTimer);
  if(rec){try{rec.onend=null;rec.stop()}catch{}rec=null}
  setStatus('Ready',false);setTranscript('','');
  if(!silent)addLog('Microphone off','');
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
    addLog('The browser’s speech service needs an internet connection. Check the connection — listening will keep retrying.','miss');
    return;
  }
  if(code==='audio-capture'){
    stop(true);setStatus('No microphone found',false);
    addLog('No microphone was found on this computer.','miss');
  }
}
function onResult(e){
  let interim='',finals='';
  for(let i=e.resultIndex;i<e.results.length;i++){
    const r=e.results[i];
    if(r.isFinal)finals+=r[0].transcript+' ';
    else interim+=r[0].transcript+' ';
  }
  if(finals.trim())finalTail=(finalTail+' '+finals).slice(-240);
  setTranscript(finalTail,interim);
  if(finals.trim())handleSegment(finals,true);
  else if(interim.trim())handleSegment(interim,false);
}
function handleSegment(text,isFinal){
  if(!hooks||!g.KingdomRef)return;
  if(isFinal){
    const cmd=g.KingdomRef.command(text);
    if(cmd)return runCommand(cmd);
  }
  const hit=g.KingdomRef.scan(text,hooks.books);
  if(!hit)return;
  if(hit.type==='verse'){
    /* "…now verse 25" — jump within the passage already on the display */
    if(!isFinal)return;
    const key='v:'+hit.verse+':'+(hit.verseEnd||'');
    if(lastSent.key===key&&Date.now()-lastSent.at<4000)return;
    return dispatch({ctx:true,verse:hit.verse,verseEnd:hit.verseEnd},key);
  }
  const key=['r',hit.book,hit.chapter,hit.verse,hit.verseEnd].join(':');
  if(lastSent.key===key&&Date.now()-lastSent.at<4000)return;
  if(!isFinal){
    /* interim text changes mid-word; require a complete verse that stayed
       stable across two interim frames before firing, so the display never
       flashes a half-spoken reference */
    if(hit.verse==null)return;
    if(pending.key===key)pending.n++;else pending={key,n:1};
    if(pending.n<2)return;
  }
  dispatch(hit,key);
}
function dispatch(hit,key){
  if(!settings.auto){
    lastSent={key,at:Date.now()};
    const label=hit.ctx?('verse '+hit.verse+(hit.verseEnd?'-'+hit.verseEnd:'')):(g.KingdomRef.format(hit,hooks.books)||'reference');
    addLog('Heard “'+label+'” — approve to send',' ',null,hit,'');
    return;
  }
  fire(hit,key);
}
function fire(hit,key){
  const started=(g.performance&&performance.now)?performance.now():Date.now();
  const done=v=>{
    if(v&&v.ref){
      lastSent={key:key||'',at:Date.now()};
      pending={key:'',n:0};
      const ms=Math.round(((g.performance&&performance.now)?performance.now():Date.now())-started);
      addLog(v.ref+' sent to the display','hit',ms,null,'▣');
    }else addLog('Heard a reference but it is outside this chapter — nothing was sent','miss');
  };
  const p=hit.ctx?hooks.gotoVerse(hit.verse,hit.verseEnd,settings.tr):hooks.present(hit,settings.tr);
  Promise.resolve(p).then(done).catch(()=>done(null));
}
function runCommand(cmd){
  if(cmd==='stop'){stop();notify('Voice listening stopped');return}
  const label={next:'Next verse',prev:'Previous verse',blank:'Screen blanked',show:'Verse restored'}[cmd];
  const fn={next:hooks.next,prev:hooks.prev,blank:hooks.blank,show:hooks.show}[cmd];
  if(!fn)return;
  Promise.resolve(fn()).then(()=>addLog(label+' (voice command)','hit',null,null,'◆')).catch(()=>{});
}

/* ---------- wiring (called every time Ministry Mode renders) ---------- */
function bind(h){
  hooks=h;
  const mic=$('#voiceMic');
  if(mic)mic.onclick=()=>{wantListen?stop():start()};
  const tr=$('#voiceTr');if(tr)tr.onchange=e=>{settings.tr=e.target.value;persist()};
  const lang=$('#voiceLang');if(lang)lang.onchange=e=>{settings.lang=e.target.value;persist();if(wantListen){/* apply the new language live */if(rec){try{rec.onend=null;rec.stop()}catch{}rec=null}spin()}};
  const auto=$('#voiceAuto');if(auto)auto.onchange=e=>{settings.auto=!!e.target.checked;persist()};
  const logEl=$('#voiceLog');
  if(logEl)logEl.onclick=e=>{
    const b=e.target.closest('[data-vsend]');if(!b)return;
    const entry=entries.find(x=>String(x.id)===b.dataset.vsend);
    if(entry&&entry.hit){fire(entry.hit,null);entry.hit=null;logEl.innerHTML=logHtml()}
  };
  /* a re-render must reflect the true module state, never reset it */
  setStatus(wantListen?'Listening':'Ready',wantListen);
}

g.KingdomVoice={supported:available,cardHtml,bind,start,stop,listening:()=>wantListen,settings};
})(typeof window!=='undefined'?window:globalThis);
