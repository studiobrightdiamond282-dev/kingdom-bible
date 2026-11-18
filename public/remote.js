/* KINGDOM BIBLE — phone ministry remote (no dependencies) */
(function(){
'use strict';
const $=s=>document.querySelector(s);
const KEY='kingdomRemoteCode';
const TR={kjv:'King James Version',asv:'American Standard Version',web:'World English Bible'};
/* short badges for the live-now strip: 'King James Version' must never render as "VERSION" */
const TRS={kjv:'KJV',asv:'ASV',web:'WEB'};
const trLabel=t=>TRS[t]||String(t||'').toUpperCase()||'—';
/* Static deployments (e.g. Vercel) have no /api. Start pessimistic and let a real
   response prove otherwise, so a dead hub is never shown as a live connection. */
let hubOnline=false;
let code=(location.search.match(/[?&]code=([A-Za-z0-9]{4,6})/)||[])[1]||localStorage.getItem(KEY)||'';
let tr='kjv', es=null, books=[], busy=false;

function toast(msg,kind){
  const t=$('#toast');t.textContent=msg;t.className='remote-toast show '+(kind||'');
  clearTimeout(toast._t);toast._t=setTimeout(()=>t.className='remote-toast',1900);
}
async function api(path,opts){
  let r;
  try{ r=await fetch(path,Object.assign({headers:{'Content-Type':'application/json'}},opts)); }
  catch{ hubOnline=false; throw new Error('Cannot reach the ministry hub'); }
  let d={};try{d=await r.json()}catch{}
  /* A successful status is not proof of a hub: a static host may return the app
     shell for unknown paths. The Node hub's JSON 401/400 responses are real hub
     replies, and /api/verse uses JSON 404 only for an unknown Scripture reference. */
  const isJson=/json/i.test(r.headers.get('content-type')||'');
  const verseMiss=path.startsWith('/api/verse')&&r.status===404&&isJson&&d.error==='Reference not found';
  const appError=[400,401].includes(r.status)&&isJson&&d.ok===false&&typeof d.error==='string';
  if(r.status>=500||!isJson||(r.status===404&&!verseMiss)){
    hubOnline=false;
    throw new Error('The ministry hub is not running on this address.');
  }
  if(!r.ok){
    hubOnline=verseMiss||appError;
    throw new Error(d.error||('HTTP '+r.status));
  }
  hubOnline=true;
  return d;
}
function setLink(on){$('#linkDot').className='remote-dot '+(on?'on':'')}
function showCtl(){ $('#pairPane').hidden=true; $('#ctlPane').hidden=false; }
function showPair(msg){ $('#pairPane').hidden=false; $('#ctlPane').hidden=true; if(msg)$('#pairMsg').textContent=msg; }

async function pair(){
  const c=(code||'').trim().toUpperCase();
  if(c.length<4)return showPair('Enter the 4–6 character service code shown on the presenter screen.');
  $('#pairBtn').disabled=true;$('#pairBtn').textContent='Connecting…';
  try{
    await api('/api/session/status',{method:'POST',body:JSON.stringify({code:c})});
    code=c;localStorage.setItem(KEY,c);showCtl();openStream();
    toast('Connected','ok');
  }catch(e){ showPair(hubOffline(e.message)); }
  finally{ $('#pairBtn').disabled=false;$('#pairBtn').textContent='Connect'; }
}
/* Give different repair steps for a public static site and a local LAN hub. */
function hubOffline(msg){
  if(hubOnline)return msg||'Could not connect.';
  const host=String(location.hostname||'').toLowerCase();
  const bareHost=host.startsWith('[')&&host.endsWith(']')?host.slice(1,-1):host;
  const octets=bareHost.split('.').map(Number);
  const privateIPv4=octets.length===4&&octets.every(n=>Number.isInteger(n)&&n>=0&&n<=255)&&
    (octets[0]===10||(octets[0]===192&&octets[1]===168)||(octets[0]===172&&octets[1]>=16&&octets[1]<=31));
  const local=bareHost==='localhost'||bareHost==='127.0.0.1'||bareHost==='::1'||privateIPv4;
  const prefix=msg?msg+' ':'';
  if(local)return prefix+'The local ministry hub is not responding. On the ministry PC run "npm start", open its LAN address, and keep the phone on the same Wi-Fi. Do not use localhost on the phone.';
  return prefix+'This address does not have the live ministry service. Open the Live Ministry Hub on the presenter, start a session there, then scan its fresh QR or use its full phone link. If the online hub is waking up, wait and reload. For a local service, run "npm start" and use the PC LAN address.';
}

function openStream(){
  if(es){es.close();es=null}
  try{ es=new EventSource('/api/stream?code='+encodeURIComponent(code)); }
  catch(e){ setLink(false); return; }
  es.addEventListener('hello',e=>{setLink(true);paint(JSON.parse(e.data).presentation)});
  es.addEventListener('presentation',e=>{setLink(true);paint(JSON.parse(e.data))});
  es.onopen=()=>setLink(true);
  es.onerror=()=>setLink(false);
}

async function act(action){
  if(busy)return;busy=true;
  try{ await api('/api/remote/action',{method:'POST',body:JSON.stringify({code,action})}); }
  catch(e){ toast(hubOffline(e.message||'Failed'),'err'); }
  finally{ setTimeout(()=>busy=false,120); }
}

/* live "on screen now" mirror */
let live={blank:true};
function paint(p){
  if(!p)return;
  live=p;
  $('#nowText').textContent=p.blank?'(blank)':(p.text||'Nothing yet');
  $('#nowRef').textContent=p.blank?'':(p.ref||'')+' · '+trLabel(p.translation);
  if(p.theme)[...$('#themeSeg').children].forEach(b=>b.classList.toggle('on',b.dataset.theme===p.theme));
  const bb=document.querySelector('[data-act="blank"]');
  if(bb){bb.textContent=p.blank?'Show verse':'Blank';bb.classList.toggle('active',!!p.blank)}
}
function currentTheme(){const on=$('#themeSeg .on');return on?on.dataset.theme:'royal'}
/* ---------- verse sending ---------- */
async function send(){
  const raw=$('#refInput').value.trim();
  const msg=$('#sendMsg');
  if(!raw){msg.textContent='Type a reference such as John 3:16';return}
  msg.textContent='Looking up…';
  let v;
  try{ v=await api('/api/verse?ref='+encodeURIComponent(raw)+'&tr='+tr); }
  catch(e){ msg.textContent=hubOnline?(e.message||'Reference not found. Try "John 3:16".'):hubOffline(e.message); return }
  msg.textContent='';
  await act({type:'presentation',payload:{
    ref:v.ref,label:v.label,text:v.text,verses:v.verses,
    book:v.book,chapter:v.chapter,verse:v.verse,verseEnd:v.verseEnd,
    translation:tr,theme:currentTheme(),blank:false
  }});
  toast('Sent to screen','ok');
  $('#refInput').value='';$('#suggest').innerHTML='';
}

/* ---------- reference suggestions ---------- */
async function loadBooks(){ try{ books=(await api('/api/books')).books||[] }catch{ books=[] } }
function suggest(q){
  const box=$('#suggest');
  if(!q||!books.length)return box.innerHTML='';
  const s=q.toLowerCase().replace(/\./g,'').trim();
  const hit=books.filter(b=>{
    const n=b.name.toLowerCase();
    return n.startsWith(s)||b.abbr.toLowerCase().replace(/\./g,'')===s||(b.aliases||[]).some(x=>x.toLowerCase()===s);
  }).slice(0,5);
  box.innerHTML=hit.map(b=>`<button type="button" data-b="${b.name}">${b.name}</button>`).join('');
  [...box.children].forEach(el=>el.onclick=()=>{
    $('#refInput').value=el.dataset.b+' ';$('#suggest').innerHTML='';$('#refInput').focus();
  });
}

/* ---------- wiring ---------- */
$('#pairBtn').onclick=pair;
$('#codeInput').oninput=e=>{code=e.target.value.toUpperCase();e.target.value=code};
$('#codeInput').onkeydown=e=>{if(e.key==='Enter')pair()};
$('#sendBtn').onclick=send;
$('#refInput').oninput=e=>suggest(e.target.value);
$('#refInput').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();send()}};
$('#leaveBtn').onclick=()=>{
  localStorage.removeItem(KEY);if(es)es.close();code='';
  showPair('');$('#codeInput').value='';setLink(false);toast('Disconnected');
};
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-act]');
  if(b){
    const t=b.dataset.act;
    if(t==='blank')return act({type:'blank',blank:!live.blank});
    return act({type:t});
  }
  const th=e.target.closest('#themeSeg [data-theme]');
  if(th){
    [...$('#themeSeg').children].forEach(x=>x.classList.toggle('on',x===th));
    /* keep whatever verse is live, only change the look */
    return act({type:'presentation',payload:{
      ref:live.ref||'',label:live.label||'',text:live.text||'',verses:live.verses||[],
      book:live.book,chapter:live.chapter,verse:live.verse,verseEnd:live.verseEnd,
      church:live.church||'',translation:tr,theme:th.dataset.theme,blank:!!live.blank
    }});
  }
  const trb=e.target.closest('#trSeg [data-tr]');
  if(trb){tr=trb.dataset.tr;[...$('#trSeg').children].forEach(x=>x.classList.toggle('on',x===trb));toast('Translation: '+tr.toUpperCase())}
});

/* ---------- boot ---------- */
(async function(){
  $('#codeInput').value=code;
  await loadBooks();
  if(code){
    try{ await api('/api/session/status',{method:'POST',body:JSON.stringify({code})}); showCtl(); openStream(); }
    catch{ showPair(hubOnline?'Previous session expired. Enter the current code.':hubOffline('')); }
  } else showPair(hubOnline?'Enter the service code shown in Ministry Mode.':hubOffline(''));
  if(!hubOnline)setLink(false);
  /* the hub may simply not have been started yet, so offer a way to try again
     without reloading the phone mid-service */
  const retry=$('#pairRetry');
  if(retry)retry.onclick=async()=>{
    retry.disabled=true;retry.textContent='Checking…';
    try{
      await loadBooks();
      const c=(code||'').trim();
      if(c){await api('/api/session/status',{method:'POST',body:JSON.stringify({code:c})});showCtl();openStream();}
      else showPair('The ministry hub is running. Enter the code shown on the presenter screen.');
    }catch(e){ showPair(hubOffline(e.message)); }
    finally{ retry.disabled=false;retry.textContent='Check again'; }
  };
})();
})();