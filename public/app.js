/* KINGDOM BIBLE — Local-first application shell */
'use strict';
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const today=()=>new Date().toISOString().slice(0,10);
const fmtDate=d=>new Intl.DateTimeFormat('en',{weekday:'long',month:'long',day:'numeric'}).format(d||new Date());
const LS='kingdomBible.v1';
const DEFAULT={profile:{name:'',translation:'kjv',theme:'dark',font:'serif',fontSize:20,lineHeight:1.9,readingTime:'06:30',notifications:false,avatar:''},reader:{book:44,chapter:8,translation:'kjv',lastVerse:1},bookmarks:{},highlights:{},notes:{},prayers:[],planProgress:{},history:[],favorites:{},aiHistory:[],readingDays:[],chaptersRead:[],installed:false,devotionalDone:[],onboarded:true,ministry:{theme:'royal',church:'KINGDOM BIBLE',speaker:'',sermon:''}};
let state=loadState(),books=[],bookCache=new Map(),xrefCache=new Map(),route='home',selectedVerse=null,deferredInstall=null,searchWorker=null,searchState={query:'',results:[],total:0,status:''};
function loadState(){try{return deepMerge(structuredClone(DEFAULT),JSON.parse(localStorage.getItem(LS)||'{}'))}catch{return structuredClone(DEFAULT)}}
function deepMerge(a,b){for(const k in b){if(b[k]&&typeof b[k]==='object'&&!Array.isArray(b[k])&&a[k]&&typeof a[k]==='object'&&!Array.isArray(a[k]))deepMerge(a[k],b[k]);else a[k]=b[k]}return a}
function save(){localStorage.setItem(LS,JSON.stringify(state)); updateProfileBits()}
function avatarMarkup(){const n=displayName(),i=esc(n[0]?.toUpperCase()||'R');return state.profile.avatar?`<img src="${esc(state.profile.avatar)}" alt="${esc(n)} profile photo">`:i}
function updateProfileBits(){const n=displayName();$$('#sideName').forEach(x=>x.textContent=n);$$('.avatar').forEach(x=>x.innerHTML=avatarMarkup());document.documentElement.dataset.theme=state.profile.theme;document.documentElement.style.setProperty('--reader-size',state.profile.fontSize+'px');document.documentElement.style.setProperty('--reader-line',state.profile.lineHeight)}
/* The greeting must belong to whoever is signed in, never to whoever built the app.
   A stale name in localStorage would also leak to the next visitor on a shared
   device, so the display name is always re-derived from the signed-in account. */
function displayName(){const n=String(state.profile.name||'').trim();return n||'Reader'}
function syncIdentity(u){if(!u)return;const raw=String(u.name||'').trim()||String(u.email||'').split('@')[0].trim();if(raw&&raw!==state.profile.name){state.profile.name=raw;save()}}
/* ---- account gate ---- */
let accountState={signedIn:false,status:'signed_out',daysRemaining:0,plan:'none'};
function applyAccount(u){accountState=u?{signedIn:true,status:u.status,daysRemaining:u.daysRemaining||0,plan:u.plan,role:u.role,name:u.name}:{signedIn:false,status:'signed_out',daysRemaining:0,plan:'none'};syncIdentity(u);try{window.KingdomPremium&&(window.KingdomPremium.onAuth=u?()=>{syncIdentity(u);paintTrialBanner()}:null)}catch{}}
function freeOnly(){return accountState.status==='expired'||accountState.status==='signed_out'}
function paintTrialBanner(){const el=$('#trialBanner');if(!el)return;const s=accountState;if(s.status==='trial'&&s.daysRemaining<=7){el.hidden=false;el.innerHTML=`<span>⏳ <strong>${s.daysRemaining} day${s.daysRemaining===1?'':'s'} left</strong> in your free trial.</span><button class="secondary-btn small-btn" data-open-premium>Choose a plan</button>`;el.querySelector('[data-open-premium]').onclick=()=>window.KingdomPremium?.open()}else if(s.status==='expired'){el.hidden=false;el.innerHTML=`<span>🔒 Your free trial has ended. You have free reading access.</span><button class="secondary-btn small-btn" data-open-premium>See subscription plans</button>`;el.querySelector('[data-open-premium]').onclick=()=>window.KingdomPremium?.open()}else{el.hidden=true;el.innerHTML=''}}
function showSignInGate(){const m=$('#main');if(!m)return;document.body.classList.add('gate-open');$$('#desktopNav,#mobileNav,.side-footer').forEach(x=>x&&(x.style.display='none'));m.innerHTML=`<div class="signin-gate"><img class="gate-logo" src="/assets/logo.png" alt="KINGDOM BIBLE"><div class="eyebrow">KINGDOM BIBLE</div><h1>Welcome</h1><p class="lead">Sign in to read, study and share the Word. Your 30-day free trial starts the moment you create an account.</p><div id="gateGoogle" class="google-mount"></div><div class="auth-divider"><span>or use email</span></div><div class="gate-actions"><button class="primary-btn" id="gateRegister">Create free account · 30 days</button><button class="secondary-btn" id="gateLogin">I already have an account</button></div><p class="gate-note">Your data stays private · <a href="/privacy" target="_blank">Privacy</a> · <a href="/refund" target="_blank">Refunds</a></p></div>`;$('#gateRegister').onclick=()=>window.KingdomPremium?.open();$('#gateLogin').onclick=()=>window.KingdomPremium?.open();window.KingdomPremium?.googleButton($('#gateGoogle'))}
const NAV=[['home','⌂','Home'],['bible','▤','Bible'],['study','✦','Study'],['search','⌕','Search'],['prayer','♧','Prayer'],['devotional','☼','Devotional'],['plans','◫','Plans'],['ministry','▣','Ministry'],['profile','○','Profile']];
const QUICK=[['bible','▤','Read Bible'],['search','⌕','Search'],['study','✦','Study'],['prayer','♧','Pray'],['bible','◉','Listen'],['plans','◇','Memorize'],['study','✎','Sermon'],['ministry','▣','Present']];
const TR={kjv:'KJV',asv:'ASV',web:'WEB'};
const DEVOTIONAL={title:'Walking by Faith',scripture:'2 Corinthians 5:7',verse:'For we walk by faith, not by sight.',message:[`Faith is not a denial of what we can see. It is a settled confidence that God remains faithful beyond the limits of our present view. Paul writes these words while speaking about courage, longing, and the hope of being with the Lord.`, `Today, choose the next faithful step available to you. You may not see the whole road, but Scripture invites you to trust the One who does. Let the Word—not fear, pressure, or appearances—shape your response.`],reflection:'Where are you being invited to trust God beyond what you can presently see?',prayer:'Lord, steady my heart in Your truth. Help me walk faithfully today, guided by Your Word rather than by fear. Give me wisdom for the next step and courage to obey. Amen.',action:'Write down one faithful next step, then prayerfully take it today.'};
const PLANS=[{id:'year',icon:'◫',name:'Bible in One Year',days:365,desc:'Journey through the whole Bible with a balanced daily rhythm.'},{id:'nt90',icon:'✦',name:'New Testament in 90 Days',days:90,desc:'Read through the New Testament in a focused three-month journey.'},{id:'gospels30',icon:'☼',name:'Gospels in 30 Days',days:30,desc:'Walk with Jesus through Matthew, Mark, Luke, and John.'},{id:'psalms30',icon:'♬',name:'Psalms in 30 Days',days:30,desc:'Pray and reflect through the book of Psalms.'},{id:'proverbs31',icon:'◇',name:'Proverbs in 31 Days',days:31,desc:'One chapter of biblical wisdom each day.'},{id:'faith7',icon:'♧',name:'7 Days of Faith',days:7,desc:'Key passages for trusting God in every season.'},{id:'prayer7',icon:'○',name:'7 Days of Prayer',days:7,desc:'A Scripture-centered week of growing in prayer.'},{id:'kingdom21',icon:'♕',name:'21 Days of Kingdom Living',days:21,desc:'Explore the values and calling of God’s Kingdom.'},{id:'jesus30',icon:'✧',name:'30 Days with Jesus',days:30,desc:'Daily encounters with the words and works of Christ.'}];
const DICTIONARY={grace:['God’s unmerited favor and active kindness toward humanity. In the New Testament, grace is central to salvation and Christian life.',['Ephesians 2:8-9','Titus 2:11-12','Romans 3:24']],faith:['Trust, confidence, and faithful reliance upon God. Biblical faith includes belief expressed through allegiance and action.',['Hebrews 11:1','Romans 10:17','James 2:17']],covenant:['A solemn, binding relationship established by God, often accompanied by promises, signs, and responsibilities.',['Genesis 17:7','Exodus 24:7-8','Luke 22:20']],atonement:['Reconciliation with God through the dealing with sin; fulfilled for Christians in the sacrificial death of Jesus Christ.',['Leviticus 16:30','Romans 3:25','1 John 2:2']],kingdom:['God’s sovereign reign and rule, announced and embodied in the ministry of Jesus and awaiting final consummation.',['Matthew 6:33','Mark 1:15','Revelation 11:15']],gospel:['The good news of God’s saving work through Jesus Christ—His life, death, resurrection, and lordship.',['Mark 1:1','Romans 1:16','1 Corinthians 15:1-4']],sanctification:['The work of God by which believers are set apart and progressively formed in holiness.',['John 17:17','1 Thessalonians 4:3','Hebrews 12:14']]};
async function init(){
  updateProfileBits();
  try{books=(await (await fetch('/data/books.json')).json()).books}catch(e){$('#main').innerHTML=`<div class="empty-state"><h3>Unable to load Bible library</h3><p>${esc(e.message)}</p></div>`;return}
  renderNav(); bindGlobal();
  if(location.pathname.startsWith('/present')||new URLSearchParams(location.search).has('present')){renderPresentation();return}
  /* Splash -> account. The presentation surface is a capture target for the
     projector and must never be gated, so it returns above. */
  try{applyAccount(await window.KingdomPremium?.load())}catch{}
  if(!accountState.signedIn){showSignInGate();return}
  paintTrialBanner();
  const hash=location.hash.slice(1),valid=NAV.some(n=>n[0]===hash.split('/')[0]); navigate(valid?hash:'home',false);
  registerPWA(); networkStatus();
}
function renderNav(){
  $('#desktopNav').innerHTML=NAV.map((n,i)=>`${i===7?'<div class="nav-sep">MINISTRY & ACCOUNT</div>':''}<button class="nav-btn" data-route="${n[0]}"><span class="nav-icon">${n[1]}</span>${n[2]}</button>`).join('');
  const mob=NAV.filter(n=>['home','bible','search','prayer','profile'].includes(n[0]));
  $('#mobileNav').innerHTML=mob.map(n=>`<button class="nav-btn" data-route="${n[0]}"><span class="nav-icon">${n[1]}</span>${n[2]}</button>`).join('');
}
function bindGlobal(){
  document.addEventListener('click',e=>{const r=e.target.closest('[data-route]');if(r){e.preventDefault();navigate(r.dataset.route)}const c=e.target.closest('[data-close]');if(c)closeModal()});
  $('#commandBtn').onclick=openCommand;$('#quickBtn').onclick=openQuick;$('#themeBtn').onclick=cycleTheme;
  $('#notifBtn').onclick=()=>toast('No new notifications');
  window.addEventListener('hashchange',()=>navigate(location.hash.slice(1)||'home',false));
  window.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openCommand()}if(!/input|textarea|select/i.test(e.target.tagName)&&!e.ctrlKey&&!e.metaKey){if(e.key.toLowerCase()==='b')navigate('bible');if(e.key.toLowerCase()==='s')navigate('search');if(e.key.toLowerCase()==='p')navigate('ministry')}});let adminHold=null;$$('[data-admin-trigger]').forEach(logo=>{const start=()=>{clearTimeout(adminHold);adminHold=setTimeout(()=>{location.href='/admin'},2500)},cancel=()=>clearTimeout(adminHold);logo.addEventListener('pointerdown',start);logo.addEventListener('pointerup',cancel);logo.addEventListener('pointercancel',cancel);logo.addEventListener('pointerleave',cancel)})
}
function navigate(to,push=true){route=to.split('/')[0]||'home';if(push)history.pushState(null,'','#'+to);$$('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.route===route));const info=NAV.find(n=>n[0]===route)||NAV[0];$('#pageTitle').textContent=info[2];$('#pageEyebrow').textContent=route==='ministry'?'MINISTRY MODE':'KINGDOM BIBLE';closeModal();renderRoute(to);scrollTo(0,0)}
function renderRoute(full){const m=$('#main');m.innerHTML='<div class="loading-screen"><span></span><p>Opening…</p></div>';const renderers={home:renderHome,bible:renderBible,search:renderSearch,study:renderStudy,prayer:renderPrayer,devotional:renderDevotional,plans:renderPlans,ministry:renderMinistry,profile:renderProfile};Promise.resolve(renderers[route]?.(full)).catch(e=>{console.error(e);m.innerHTML=`<div class="empty-state"><div class="empty-icon">!</div><h3>Something went wrong</h3><p>${esc(e.message)}</p><button class="secondary-btn" data-route="home">Return home</button></div>`})}
async function loadBook(tr,bi){const key=tr+':'+bi;if(bookCache.has(key))return bookCache.get(key);const d=await (await fetch(`/data/bibles/${tr}/${bi}.json`)).json();bookCache.set(key,d);return d}
async function getVerse(ref,tr=state.reader.translation){const p=parseRef(ref);if(!p)return null;const v=p.verse||1;const d=await loadBook(tr,p.book);return {...p,verse:v,text:d.chapters[p.chapter-1]?.[v-1],translation:tr,ref:`${books[p.book].name} ${p.chapter}:${v}`}}
/* One parser for everything the user can type or say. bible-ref.js understands
   "jn 3 16", "1john2:5", "John 3:16-18", spoken forms and misspellings —
   exact -> prefix -> subsequence -> edit distance, never a blind guess.
   The old exact-match-only regex here was the "Reference not found" bug. */
function parseRef(s){
  if(window.KingdomRef)return window.KingdomRef.parse(s,books);
  s=String(s||'').trim();const m=s.match(/^(.+?)\s+(\d+)(?::(\d+)(?:[-–]\d+)?)?$/);if(!m)return null;
  const q=m[1].toLowerCase().replace(/\./g,'').trim();
  const bi=books.findIndex(b=>[b.name,b.abbr,...b.aliases].some(a=>a.toLowerCase().replace(/\./g,'')===q));
  if(bi<0)return null;return{book:bi,chapter:+m[2],verse:m[3]?+m[3]:null,verseEnd:null};
}
/* Resolve a reference into display-ready verses: a single verse, a range
   ("John 3:16-18") or a whole chapter — the client twin of server.js resolve(),
   so Ministry Mode and Voice Mode work even with no hub (static hosting). */
async function getPassage(ref,tr=state.reader.translation){
  const p=typeof ref==='object'&&ref?ref:parseRef(ref);
  if(!p||!books[p.book])return null;
  const d=await loadBook(tr,p.book),ch=d.chapters[p.chapter-1];
  if(!ch)return null;
  const MAXV=40;let list=[];
  if(p.verse==null)list=ch.slice(0,MAXV).map((t,i)=>({n:i+1,text:t}));
  else{
    if(p.verse>ch.length)return null;
    const end=Math.min(p.verseEnd||p.verse,ch.length,p.verse+MAXV-1);
    for(let i=p.verse;i<=end;i++)list.push({n:i,text:ch[i-1]});
  }
  if(!list.length||!list[0].text)return null;
  const label=`${books[p.book].name} ${p.chapter}`;
  const out=p.verse==null?label:list.length===1?`${label}:${list[0].n}`:`${label}:${list[0].n}-${list[list.length-1].n}`;
  return{book:p.book,chapter:p.chapter,verse:list[0].n,verseEnd:list[list.length-1].n,verses:list,text:list.map(v=>v.text).join(' '),ref:out,label,translation:tr};
}
function markRead(b,c){const id=`${b}:${c}`;if(!state.chaptersRead.includes(id))state.chaptersRead.push(id);if(!state.readingDays.includes(today()))state.readingDays.push(today());save()}
function streak(){let n=0,d=new Date();for(;;){const k=d.toISOString().slice(0,10);if(state.readingDays.includes(k)){n++;d.setDate(d.getDate()-1)}else if(n===0&&k===today()){d.setDate(d.getDate()-1)}else break}return n}
function toast(msg,type=''){const x=document.createElement('div');x.className='toast '+type;x.textContent=msg;$('#toastRoot').append(x);setTimeout(()=>x.remove(),3100)}
function modal(html,cls=''){$('#modalRoot').innerHTML=`<div class="modal-backdrop"><div class="modal ${cls}" role="dialog" aria-modal="true">${html}</div></div>`;setTimeout(()=>$('.modal input,.modal textarea')?.focus(),20);$('.modal-backdrop').onclick=e=>{if(e.target.classList.contains('modal-backdrop'))closeModal()}}
function closeModal(){$('#modalRoot').innerHTML=''}
function setTitle(t,e='KINGDOM BIBLE'){$('#pageTitle').textContent=t;$('#pageEyebrow').textContent=e}
function chapterOptions(bi,selected){return Array.from({length:books[bi].chapters},(_,i)=>`<option value="${i+1}" ${i+1===selected?'selected':''}>Chapter ${i+1}</option>`).join('')}
/* A chapter can run past 150 verses (Psalm 119 has 176), so a verse picker is the only
   reliable way to reach a verse instead of scrolling the whole chapter. */
function verseOptions(count,selected){const n=clamp(Number(selected)||1,1,count);return Array.from({length:count},(_,i)=>`<option value="${i+1}" ${i+1===n?'selected':''}>Verse ${i+1}</option>`).join('')}
function focusVerse(v){const el=$('#v'+v);if(!el)return;$$('.verse').forEach(x=>x.classList.remove('jump'));el.classList.add('jump');el.scrollIntoView({behavior:'smooth',block:'center'})}
function goToVerse(v){const sel=$('#readerVerse'),n=clamp(Number(v)||1,1,sel?sel.options.length:1);state.reader.lastVerse=n;save();if(sel)sel.value=String(n);focusVerse(n)}
function translationOptions(sel){return Object.entries(TR).map(([k,v])=>`<option value="${k}" ${k===sel?'selected':''}>${v}</option>`).join('')}

/* HOME */
async function renderHome(){
  setTitle('Home');const dailyRefs=['John 3:16','Psalms 119:105','Proverbs 3:5','Isaiah 41:10','Romans 8:28','Philippians 4:6','Matthew 6:33','Joshua 1:9','2 Corinthians 5:7','Psalms 46:1'];
  const dr=dailyRefs[Math.floor(Date.now()/86400000)%dailyRefs.length],dv=await getVerse(dr),last=state.reader;
  $('#main').innerHTML=`<div class="page">
    <div class="welcome-row"><div><div class="eyebrow">${esc(fmtDate())}</div><h1 class="hero-title">Good ${new Date().getHours()<12?'morning':new Date().getHours()<18?'afternoon':'evening'}, ${esc(displayName())}.</h1><p class="lead">Make space for the Word today.</p></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="secondary-btn" id="resumeTop">▤ Continue reading</button><button class="primary-btn" id="homeUpgrade">✦ Try Pro free</button></div></div>
    <div class="home-membership card"><div><div class="eyebrow">KINGDOM BIBLE PRO</div><strong>30 days to build a deeper rhythm</strong><p>Unlock ministry tools, guided study, AI Bible questions, and referral rewards. Read the <a href="/privacy" target="_blank">privacy</a> and <a href="/refund" target="_blank">refund</a> policy before subscribing.</p></div><button class="secondary-btn small-btn" id="homeWhatsApp">WhatsApp support</button></div>
    <div class="daily-grid"><article class="card verse-card"><div class="eyebrow">VERSE OF THE DAY · ${TR[dv.translation]}</div><blockquote>“${esc(dv.text)}”</blockquote><cite>— ${esc(dv.ref)}</cite><div class="card-actions"><button class="secondary-btn small-btn" id="dailySave">♡ Save</button><button class="secondary-btn small-btn" id="dailyShare">↗ Share</button><button class="secondary-btn small-btn" id="dailyOpen">Read chapter</button></div></article>
    <div class="today-stack"><article class="card continue-card"><span class="book-mark">${esc(books[last.book].name[0])}</span><div class="eyebrow">CONTINUE READING</div><h3>${esc(books[last.book].name)} ${last.chapter}</h3><p>Resume where you last stopped.</p><button class="text-btn" id="resumeReading">Continue →</button></article><article class="card devotional-card"><div class="eyebrow">TODAY’S DEVOTIONAL</div><h3>${DEVOTIONAL.title}</h3><p>${DEVOTIONAL.scripture} · 5 min read</p><button class="text-btn" data-route="devotional">Read devotional →</button></article></div></div>
    <div class="section-head"><div><h2>Today with God</h2><p>Personal activity only — never a measure of spiritual worth.</p></div></div>
    <div class="home-stats"><div class="card stat-card"><span class="stat-icon">♨</span><div><strong>${streak()}</strong><small>day reading streak</small></div></div><div class="card stat-card"><span class="stat-icon">▤</span><div><strong>${state.chaptersRead.length}</strong><small>chapters read</small></div></div><div class="card stat-card"><span class="stat-icon">♡</span><div><strong>${Object.keys(state.bookmarks).length}</strong><small>verses saved</small></div></div><div class="card stat-card"><span class="stat-icon">♧</span><div><strong>${state.prayers.length}</strong><small>prayer entries</small></div></div></div>
    <div class="section-head"><div><h2>Quick actions</h2><p>Scripture-centered tools, one tap away.</p></div></div><div class="quick-grid">${QUICK.map(q=>`<button class="quick-card" data-route="${q[0]}"><span>${q[1]}</span><strong>${q[2]}</strong></button>`).join('')}</div>
    <div class="section-head"><div><h2>Your next step</h2><p>A gentle rhythm for today.</p></div></div><div class="card" style="padding:20px;display:flex;gap:16px;align-items:center;flex-wrap:wrap"><div class="stat-icon">◇</div><div style="flex:1;min-width:220px"><strong>Memory verse · ${dv.ref}</strong><p style="margin:4px 0;color:var(--muted);font-size:12px">Read it aloud, hide key words, then recall it from memory.</p></div><button class="secondary-btn" id="memoryStart">Begin practice</button></div>
  </div>`;
  const resume=()=>{state.reader={...last};navigate('bible')};$('#resumeTop').onclick=resume;$('#resumeReading').onclick=resume;$('#homeUpgrade').onclick=()=>window.KingdomPremium?.open();$('#homeWhatsApp').onclick=()=>window.open('https://wa.me/23481344338808?text=Hello%20KINGDOM%20BIBLE%20support','_blank','noopener');
  $('#dailyOpen').onclick=()=>openReference(dv.ref);$('#dailySave').onclick=()=>{state.bookmarks[dv.ref]={text:dv.text,date:today(),folder:'Favorite Scriptures'};save();toast('Verse saved','success')};$('#dailyShare').onclick=()=>shareText(`${dv.text}\n— ${dv.ref} (${TR[dv.translation]})`);$('#memoryStart').onclick=()=>openMemory(dv);
}

/* BIBLE READER */
async function renderBible(){
  setTitle('Bible');const r=state.reader, data=await loadBook(r.translation,r.book);r.chapter=clamp(r.chapter,1,data.chapters.length);const ch=data.chapters[r.chapter-1];markRead(r.book,r.chapter);
  $('#main').innerHTML=`<div class="page reader-layout"><aside class="card book-panel"><h3>OLD TESTAMENT</h3>${books.slice(0,39).map((b,i)=>bookRow(b,i,r.book)).join('')}<h3>NEW TESTAMENT</h3>${books.slice(39).map((b,j)=>bookRow(b,j+39,r.book)).join('')}</aside>
  <section class="reader-main"><div class="reader-toolbar"><select class="reader-select reader-mobile-books" id="readerBook" aria-label="Book">${books.map((b,i)=>`<option value="${i}" ${i===r.book?'selected':''}>${b.name}</option>`).join('')}</select><select class="reader-select" id="readerChapter" aria-label="Chapter">${chapterOptions(r.book,r.chapter)}</select><select class="reader-select reader-verse-select" id="readerVerse" aria-label="Verse">${verseOptions(ch.length,r.lastVerse)}</select><select class="reader-select" id="readerTranslation" aria-label="Translation">${translationOptions(r.translation)}</select><span class="reader-spacer"></span><button class="icon-btn" id="readerAudio" title="Read aloud">◉</button><button class="icon-btn" id="readerSettings" title="Reading settings">Aa</button></div>
  <article class="card chapter-paper"><div class="chapter-label">${TR[r.translation]} · ${books[r.book].t==='OT'?'OLD':'NEW'} TESTAMENT</div><h1>${books[r.book].name} ${r.chapter}</h1><div class="scripture-text">${ch.map((v,i)=>verseHTML(v,i+1,r)).join(' ')}</div></article>
  <div class="reader-footer"><button class="secondary-btn" id="prevChapter">← Previous</button><span class="pill">${r.chapter} / ${data.chapters.length}</span><button class="secondary-btn" id="nextChapter">Next →</button></div></section>
  <aside class="card study-panel"><div class="study-tabs"><button class="active">Study</button><button>Notes</button><button>Saved</button></div><div id="contextPanel"><div class="eyebrow">CHAPTER CONTEXT</div><h3>${books[r.book].name} ${r.chapter}</h3><p>Select a verse to open study tools, cross references, notes, highlights, and Scripture assistance.</p><button class="secondary-btn small-btn" data-route="study">Open Study Mode</button><h3>Translation</h3><p>${r.translation==='kjv'?'King James Version · Public domain':r.translation==='asv'?'American Standard Version (1901) · Public domain':'World English Bible · Public domain'}</p></div></aside></div>`;
  $$('.book-row').forEach(b=>b.onclick=()=>changeReader(+b.dataset.book,1));$('#readerBook').onchange=e=>changeReader(+e.target.value,1);$('#readerChapter').onchange=e=>changeReader(r.book,+e.target.value);$('#readerTranslation').onchange=e=>{state.reader.translation=e.target.value;save();renderBible()};
  $$('.verse').forEach(v=>v.onclick=()=>{const n=+v.dataset.v;const sv=$('#readerVerse');if(sv)sv.value=String(n);openVerse(n,ch[n-1])});$('#prevChapter').onclick=()=>stepChapter(-1);$('#nextChapter').onclick=()=>stepChapter(1);$('#readerSettings').onclick=openReaderSettings;$('#readerAudio').onclick=()=>speakChapter(ch,r);
  if($('#readerVerse'))$('#readerVerse').onchange=e=>goToVerse(+e.target.value);
  if(r.lastVerse>1&&r.lastVerse<=ch.length)setTimeout(()=>focusVerse(r.lastVerse),60);
}
function bookRow(b,i,sel){return `<button class="book-row ${i===sel?'active':''}" data-book="${i}"><span>${b.name}</span><small>${b.chapters}</small></button>`}
function verseHTML(text,v,r){const ref=`${books[r.book].name} ${r.chapter}:${v}`,hl=state.highlights[ref]?.color||'';return `<span class="verse ${hl?'hl-'+hl:''}" data-v="${v}" id="v${v}"><sup class="verse-num">${v}</sup>${text?esc(text):'<em style="color:var(--muted);font-family:var(--ui);font-size:.68em">Verse not included in this edition.</em>'}</span>`}
function changeReader(book,chapter){state.reader.book=book;state.reader.chapter=chapter;state.reader.lastVerse=1;save();renderBible();scrollTo(0,0)}
async function stepChapter(d){let {book,chapter}=state.reader;chapter+=d;if(chapter<1){if(book===0)return;book--;chapter=books[book].chapters}else if(chapter>books[book].chapters){if(book===65)return;book++;chapter=1}changeReader(book,chapter)}
async function openReference(ref){const p=parseRef(ref);if(!p){toast('Reference not recognized — try “John 3:16”','error');return}const vv=p.verse||1;state.reader.book=p.book;state.reader.chapter=p.chapter;state.reader.lastVerse=vv;save();navigate('bible');setTimeout(()=>focusVerse(vv),350)}
function openVerse(v,text){const r=state.reader,ref=`${books[r.book].name} ${r.chapter}:${v}`;selectedVerse={ref,text,book:r.book,chapter:r.chapter,verse:v,translation:r.translation};state.reader.lastVerse=v;save();modal(`<div class="verse-sheet"><div class="modal-head"><div><div class="eyebrow">${TR[r.translation]} · SELECTED VERSE</div><h2>${esc(ref)}</h2></div><button class="close-btn" data-close>×</button></div><div class="selected-passage">“${esc(text)}”<cite>${esc(ref)} · ${TR[r.translation]}</cite></div><div class="action-grid"><button class="action-btn" data-vact="bookmark"><span>♡</span>${state.bookmarks[ref]?'Unsave':'Save'}</button><button class="action-btn" data-vact="highlight"><span>▰</span>Highlight</button><button class="action-btn" data-vact="note"><span>✎</span>Note</button><button class="action-btn" data-vact="copy"><span>▣</span>Copy</button><button class="action-btn" data-vact="share"><span>↗</span>Share</button><button class="action-btn" data-vact="compare"><span>◫</span>Compare</button><button class="action-btn" data-vact="xref"><span>⌁</span>Cross refs</button><button class="action-btn" data-vact="ai"><span>✦</span>Study</button><button class="action-btn" data-vact="prayer"><span>♧</span>Prayer</button><button class="action-btn" data-vact="memory"><span>◇</span>Memorize</button><button class="action-btn" data-vact="present"><span>▣</span>Present</button><button class="action-btn" data-vact="collection"><span>⊕</span>Collection</button></div></div>`,'verse-modal');$$('[data-vact]').forEach(b=>b.onclick=()=>verseAction(b.dataset.vact))}
async function verseAction(a){const v=selectedVerse;if(a==='bookmark'){if(state.bookmarks[v.ref])delete state.bookmarks[v.ref];else state.bookmarks[v.ref]={text:v.text,date:today(),folder:'Favorite Scriptures'};save();closeModal();toast(state.bookmarks[v.ref]?'Verse saved':'Bookmark removed','success')}
 else if(a==='highlight')openHighlights();else if(a==='note')openNote(v);else if(a==='copy'){await navigator.clipboard.writeText(`“${v.text}” — ${v.ref} (${TR[v.translation]})`);toast('Copied to clipboard');closeModal()}else if(a==='share')shareText(`${v.text}\n— ${v.ref} (${TR[v.translation]})`);else if(a==='compare')openCompare(v);else if(a==='xref')openXrefs(v);else if(a==='ai'){closeModal();state.aiContext=v;save();navigate('study')}else if(a==='prayer'){closeModal();openPrayerForm(v)}else if(a==='memory')openMemory(v);else if(a==='present'){closeModal();state.ministry.current=v;save();navigate('ministry')}else toast('Custom collections are coming soon')}
function openHighlights(){modal(`<div class="modal-head"><div><h2>Highlight verse</h2><p>${esc(selectedVerse.ref)}</p></div><button class="close-btn" data-close>×</button></div><div class="highlight-colors">${['yellow','blue','green','red','purple','orange'].map(c=>`<button class="color-dot" data-color="${c}" style="background:${c==='yellow'?'#facc15':c==='blue'?'#3b82f6':c==='green'?'#22c55e':c==='red'?'#ef4444':c==='purple'?'#a855f7':'#f97316'}" aria-label="${c}"></button>`).join('')}</div><div class="modal-actions"><button class="secondary-btn" id="clearHighlight">Remove highlight</button></div>`);$$('[data-color]').forEach(b=>b.onclick=()=>{state.highlights[selectedVerse.ref]={color:b.dataset.color,text:selectedVerse.text,date:today()};save();closeModal();renderBible();toast('Highlight saved','success')});$('#clearHighlight').onclick=()=>{delete state.highlights[selectedVerse.ref];save();closeModal();renderBible()}}
function openNote(v){const old=state.notes[v.ref]||{};modal(`<div class="modal-head"><div><h2>Scripture note</h2><p>${esc(v.ref)}</p></div><button class="close-btn" data-close>×</button></div><div class="form-grid"><div class="field full"><label>Title</label><input id="noteTitle" value="${esc(old.title||'')}" placeholder="What stood out?"/></div><div class="field full"><label>Note</label><textarea id="noteBody" placeholder="Write your reflection…">${esc(old.content||'')}</textarea></div><div class="field full"><label>Tags</label><input id="noteTags" value="${esc((old.tags||[]).join(', '))}" placeholder="faith, study, sermon"/></div></div><div class="modal-actions">${old.content?'<button class="danger-btn" id="deleteNote">Delete</button>':''}<button class="secondary-btn" data-close>Cancel</button><button class="primary-btn" id="saveNote">Save note</button></div>`);$('#saveNote').onclick=()=>{state.notes[v.ref]={title:$('#noteTitle').value.trim()||v.ref,content:$('#noteBody').value.trim(),tags:$('#noteTags').value.split(',').map(x=>x.trim()).filter(Boolean),text:v.text,date:today()};save();closeModal();toast('Note saved','success')};if($('#deleteNote'))$('#deleteNote').onclick=()=>{delete state.notes[v.ref];save();closeModal();toast('Note deleted')}}
async function openCompare(v){const vals=await Promise.all(Object.keys(TR).map(t=>getVerse(v.ref,t)));modal(`<div class="modal-head"><div><h2>Compare translations</h2><p>${esc(v.ref)} · Public-domain editions</p></div><button class="close-btn" data-close>×</button></div>${vals.map(x=>`<div style="padding:14px 0;border-bottom:1px solid var(--line)"><span class="pill">${TR[x.translation]}</span><p style="font:17px/1.7 var(--scripture);margin:9px 0">${esc(x.text||'Verse numbering differs in this edition.')}</p></div>`).join('')}`)}
async function loadXrefs(bi){if(xrefCache.has(bi))return xrefCache.get(bi);const d=await(await fetch(`/data/xrefs/${bi}.json`)).json();xrefCache.set(bi,d);return d}
async function openXrefs(v){const d=await loadXrefs(v.book),refs=d[v.ref]||[];modal(`<div class="modal-head"><div><h2>Cross references</h2><p>${esc(v.ref)} · Treasury of Scripture Knowledge</p></div><button class="close-btn" data-close>×</button></div>${refs.length?`<div>${refs.map(r=>`<button class="xref" data-ref="${esc(r.split(',')[0])}">${esc(r)}</button>`).join('')}</div>`:'<div class="empty-state"><p>No cross references are indexed for this verse.</p></div>'}<div class="notice" style="margin-top:15px">Cross references suggest related passages; they are study aids, not part of the Bible text.</div>`);$$('[data-ref]').forEach(b=>b.onclick=()=>openReference(b.dataset.ref))}
function openReaderSettings(){modal(`<div class="modal-head"><div><h2>Reading appearance</h2><p>Make the Bible comfortable to read.</p></div><button class="close-btn" data-close>×</button></div><div class="field"><label>Text size · <span id="fontVal">${state.profile.fontSize}px</span></label><input id="fontRange" type="range" min="15" max="34" value="${state.profile.fontSize}"/></div><div class="field" style="margin-top:16px"><label>Line spacing</label><select id="lineSelect"><option value="1.6">Compact</option><option value="1.9" ${state.profile.lineHeight==1.9?'selected':''}>Comfortable</option><option value="2.2" ${state.profile.lineHeight==2.2?'selected':''}>Spacious</option></select></div><div class="modal-actions"><button class="primary-btn" id="applyReading">Apply</button></div>`);$('#fontRange').oninput=e=>$('#fontVal').textContent=e.target.value+'px';$('#applyReading').onclick=()=>{state.profile.fontSize=+$('#fontRange').value;state.profile.lineHeight=+$('#lineSelect').value;save();closeModal();renderBible()}}
function speakChapter(ch,r){if(!('speechSynthesis'in window)){toast('Device speech is unavailable','error');return}if(speechSynthesis.speaking){speechSynthesis.cancel();toast('Reading stopped');return}const u=new SpeechSynthesisUtterance(`${books[r.book].name} chapter ${r.chapter}. `+ch.map((x,i)=>`Verse ${i+1}. ${x}`).join(' '));u.rate=.92;u.onend=()=>toast('Reading complete');speechSynthesis.speak(u);toast('Device read-aloud started. Tap again to stop.')}

/* SEARCH */
function renderSearch(){setTitle('Search');$('#main').innerHTML=`<div class="page"><div class="search-hero"><div class="eyebrow">FAST · COMPLETE · OFFLINE-CAPABLE</div><h1>Search the Scriptures</h1><p class="lead" style="margin:auto">Search every verse by word, exact phrase, or reference across public-domain Bible translations.</p><form class="big-search" id="searchForm"><input id="searchBox" value="${esc(searchState.query)}" placeholder='Try “faith”, “fear not”, or John 3:16' autocomplete="off"/><button class="primary-btn">Search</button></form><div class="search-filters"><button class="filter-chip active" data-test="all">All Bible</button><button class="filter-chip" data-test="ot">Old Testament</button><button class="filter-chip" data-test="nt">New Testament</button><select class="filter-chip" id="searchTr">${translationOptions(state.reader.translation)}</select></div></div><div class="results-wrap" id="searchResults">${renderSearchResults()}</div></div>`;
  let testament='all';$('#searchForm').onsubmit=e=>{e.preventDefault();performSearch($('#searchBox').value,testament,$('#searchTr').value)};$$('[data-test]').forEach(b=>b.onclick=()=>{$$('[data-test]').forEach(x=>x.classList.remove('active'));b.classList.add('active');testament=b.dataset.test;if(searchState.query)performSearch(searchState.query,testament,$('#searchTr').value)});$$('.result-item').forEach(bindResult);const p=parseRef(searchState.query);if(p&&searchState.results.length===0)openReference(searchState.query)
}
function renderSearchResults(){if(searchState.status)return `<div class="empty-state"><p>${esc(searchState.status)}</p></div>`;if(!searchState.query)return `<div class="card"><div class="empty-state"><div class="empty-icon">⌕</div><h3>Find a word, phrase, or passage</h3><p>Exact phrases can be placed in quotation marks. Search loads only when you need it.</p></div></div>`;if(!searchState.results.length)return `<div class="card"><div class="empty-state"><h3>No verses found</h3><p>Check spelling, try fewer words, or select another translation.</p></div></div>`;return `<div class="section-head"><div><h2>${searchState.total.toLocaleString()} result${searchState.total===1?'':'s'}</h2><p>Showing the first ${searchState.results.length}</p></div></div><div class="card">${searchState.results.map((r,i)=>{const a=esc(r.text.slice(0,r.at)),b=esc(r.text.slice(r.at,r.at+r.len)),c=esc(r.text.slice(r.at+r.len));return `<article class="result-item" data-result="${i}"><strong>${r.bookName} ${r.chapter}:${r.verse} · ${TR[r.translation]}</strong><p>${a}<mark>${b}</mark>${c}</p><span class="result-meta">Open verse in Bible reader →</span></article>`}).join('')}</div>`}
function performSearch(q,testament='all',translation=state.reader.translation){q=q.trim();if(!q)return;const ref=parseRef(q);if(ref&&ref.verse!=null){openReference(q);return}searchState={query:q,results:[],total:0,status:'Searching the complete Bible…'};$('#searchResults').innerHTML=renderSearchResults();if(!searchWorker){searchWorker=new Worker('/search-worker.js');searchWorker.onmessage=e=>{if(e.data.type==='status'){searchState.status=e.data.message}else if(e.data.type==='results'){searchState.results=e.data.results;searchState.total=e.data.total;searchState.status='';state.history=[e.data.query,...state.history.filter(x=>x!==e.data.query)].slice(0,10);save()}else searchState.status=e.data.message;const el=$('#searchResults');if(el){el.innerHTML=renderSearchResults();$$('.result-item').forEach(bindResult)}}}searchWorker.postMessage({type:'search',query:q,testament,translation})}
function bindResult(el){el.onclick=()=>{const r=searchState.results[+el.dataset.result];openReference(`${r.bookName} ${r.chapter}:${r.verse}`)}}

/* STUDY / SAFE ASSISTANT */
async function renderStudy(){setTitle('Kingdom AI','STUDY ASSISTANT');const context=state.aiContext;$('#main').innerHTML=`<div class="page ai-layout"><aside class="card ai-side"><button class="primary-btn ai-new" id="newStudy">＋ New study</button><div class="eyebrow">RECENT STUDIES</div><div class="ai-history">${state.aiHistory.length?state.aiHistory.slice(0,12).map((x,i)=>`<button class="history-item" data-ai-history="${i}">✦ ${esc(x.question.slice(0,32))}</button>`).join(''):'<p style="font-size:11px;color:var(--muted);padding:8px">No saved studies yet.</p>'}</div><div class="notice" style="margin-top:15px">KINGDOM AI never claims divine authority. Explanations are study aids and should be tested against Scripture.</div></aside><section class="card ai-main"><div class="ai-header"><div class="ai-mark">K</div><div><strong>KINGDOM AI</strong><div style="font-size:10px;color:var(--muted)"><span class="status-dot"></span> Scripture study mode</div></div><span class="pill premium-pill" style="margin-left:auto">LOCAL · SAFE</span></div><div class="ai-messages" id="aiMessages"><div class="ai-welcome"><div class="ai-mark" style="margin:auto;width:55px;height:55px;font-size:24px">K</div><h2>Study Scripture with clarity.</h2><p class="lead" style="margin:auto">Ask about a passage or topic. Responses use the public-domain Bible library and TSK cross references on this device.</p>${context?`<div class="notice" style="max-width:620px;margin:20px auto;text-align:left"><strong>Verse context:</strong> ${esc(context.ref)} · ${TR[context.translation]}</div>`:''}<div class="prompt-grid">${['What does John 3:16 mean?','Give me Bible verses about faith','Explain Romans 8:28 in context','Create a study on prayer'].map(q=>`<button class="prompt-card" data-prompt="${esc(q)}">${esc(q)}</button>`).join('')}</div></div></div><form class="ai-composer" id="aiForm"><textarea id="aiInput" rows="1" placeholder="Ask a question about Scripture…"></textarea><button class="primary-btn">Ask</button></form><div class="ai-disclaimer">AI-generated study aid · Bible quotations are labeled · Verify interpretation with Scripture and trusted teachers.</div></section></div>`;$$('[data-prompt]').forEach(b=>b.onclick=()=>{$('#aiInput').value=b.dataset.prompt;$('#aiForm').requestSubmit()});$('#aiForm').onsubmit=e=>{e.preventDefault();answerStudy($('#aiInput').value)};$('#newStudy').onclick=()=>{delete state.aiContext;save();renderStudy()};$$('[data-ai-history]').forEach(b=>b.onclick=()=>showSavedStudy(state.aiHistory[+b.dataset.aiHistory]));if(context)setTimeout(()=>answerStudy(`Explain ${context.ref} in context.`),120)}
async function answerStudy(q){q=q.trim();if(!q)return;const box=$('#aiMessages');box.innerHTML=`<div class="message user">${esc(q)}</div><div class="ai-answer"><p>Studying the passage and related Scriptures…</p></div>`;let refMatch=q.match(/([1-3]?\s?[A-Za-z]+(?:\s+of\s+[A-Za-z]+)?\s+\d+:\d+)/i),v=null,refs=[];if(refMatch)v=await getVerse(refMatch[1]);if(!v&&state.aiContext)v=state.aiContext;if(v){const d=await loadXrefs(v.book);refs=(d[v.ref]||[]).slice(0,7)}const topic=(q.match(/(?:about|on)\s+([a-z ]+?)[?.]?$/i)||[])[1]?.trim().toLowerCase();let html;if(v){const key=(v.text.match(/\b(faith|grace|love|kingdom|gospel|covenant)\b/i)||[])[1]?.toLowerCase();html=`<div class="message user">${esc(q)}</div><div class="ai-answer"><div class="eyebrow">SCRIPTURE-BASED STUDY</div><h3>Direct answer</h3><p>${studySummary(v)}</p><h3>Bible text</h3><p style="font-family:var(--scripture);font-size:18px">“${esc(v.text)}” <button class="citation" data-ref="${esc(v.ref)}">${esc(v.ref)} · ${TR[v.translation||state.reader.translation]}</button></p><h3>Biblical context</h3><p>This verse should be read within ${esc(books[v.book].name)} ${v.chapter}. Consider the argument or narrative before and after it rather than treating one sentence in isolation.</p>${key&&DICTIONARY[key]?`<h3>Key term · ${key}</h3><p>${DICTIONARY[key][0]}</p>`:''}<h3>Relevant Scriptures</h3><p>${refs.length?refs.map(r=>`<button class="citation" data-ref="${esc(r.split(',')[0])}">${esc(r)}</button>`).join(' '):'No indexed cross references were found for this verse.'}</p><h3>Interpretation note</h3><p>Christian traditions may emphasize different aspects of this passage. The explanation above is a study aid, not a claim to divine authority. Compare translations, examine the full chapter, and consult trusted teachers.</p><h3>Practical application</h3><p>Read the chapter slowly. Write one truth the passage reveals, one response it invites, and one question for further study. Pray in words shaped by the text rather than treating the explanation as Scripture.</p></div>`}else{const t=topic&&DICTIONARY[topic]?topic:Object.keys(DICTIONARY).find(k=>q.toLowerCase().includes(k));if(t){const d=DICTIONARY[t];html=`<div class="message user">${esc(q)}</div><div class="ai-answer"><div class="eyebrow">TOPICAL STUDY · ${esc(t.toUpperCase())}</div><h3>Direct answer</h3><p>${esc(d[0])}</p><h3>Relevant Scriptures</h3><p>${d[1].map(r=>`<button class="citation" data-ref="${r}">${r}</button>`).join(' ')}</p><h3>Study questions</h3><ul><li>What does each passage reveal about God?</li><li>How does the immediate context refine the topic?</li><li>What faithful response does the text invite?</li></ul><h3>Further study</h3><p>Use Bible Search to examine the word across both Testaments, then compare each result in context.</p></div>`}else html=`<div class="message user">${esc(q)}</div><div class="ai-answer"><h3>I need a clearer Scripture reference or topic.</h3><p>This local study assistant works from verifiable Bible references and a reviewed topic dictionary. Try “Explain Romans 8:28,” “What does John 3:16 mean?” or “Bible verses about grace.”</p><div class="notice">Open-ended generative answers are intentionally unavailable in this offline build rather than pretending an external AI service is connected.</div></div>`}box.innerHTML=html;$$('.citation',box).forEach(b=>b.onclick=()=>openReference(b.dataset.ref));state.aiHistory.unshift({question:q,html,date:today()});state.aiHistory=state.aiHistory.slice(0,25);delete state.aiContext;save()}
function studySummary(v){const t=v.text.toLowerCase();if(t.includes('god so loved'))return 'John 3:16 summarizes God’s love expressed through the giving of His Son, calling for trust in Him and promising eternal life rather than perishing.';if(t.includes('all things work together'))return 'Paul encourages those who love God that God works through every circumstance toward His good purpose; the surrounding passage defines that purpose in terms of being conformed to Christ.';if(t.includes('faith'))return 'This passage highlights trust and faithful reliance upon God. Its immediate chapter gives the specific shape and purpose of that faith.';return `This verse contributes to the message of ${books[v.book].name} by directing attention to God’s character, work, and the response invited from the reader.`}
function showSavedStudy(x){$('#aiMessages').innerHTML=x.html;$$('.citation',$('#aiMessages')).forEach(b=>b.onclick=()=>openReference(b.dataset.ref))}

/* PRAYER */
function renderPrayer(){setTitle('Prayer');$('#main').innerHTML=`<div class="page"><div class="welcome-row"><div><div class="eyebrow">PRIVATE · SCRIPTURE-CENTERED</div><h1 class="hero-title">Prayer Journal</h1><p class="lead">Bring your requests, thanksgiving, and testimonies before God. Entries stay on this device.</p></div><button class="primary-btn" id="newPrayer">＋ New prayer</button></div><div class="split-layout"><section><div class="section-head"><div><h2>Your prayers</h2><p>${state.prayers.length} private ${state.prayers.length===1?'entry':'entries'}</p></div><div><button class="filter-chip active">All</button></div></div><div class="prayer-list">${state.prayers.length?state.prayers.map((p,i)=>`<article class="card prayer-item"><span class="prayer-status" style="background:${p.status==='Answered'?'var(--success)':p.status==='Waiting'?'var(--warning)':'var(--gold)'}"></span><div><h3>${esc(p.title)}</h3><p>${esc(p.body)}</p><span class="pill">${esc(p.category)}</span> <span class="pill">${esc(p.status)}</span><br><time>${esc(p.date)}</time></div><button class="icon-btn" data-prayer-menu="${i}">•••</button></article>`).join(''):`<div class="card empty-state"><div class="empty-icon">♧</div><h3>Your journal is ready</h3><p>Add a private prayer, Scripture-shaped request, or thanksgiving.</p><button class="primary-btn" id="emptyPrayer">Write first prayer</button></div>`}</div></section><aside class="card prayer-side"><div class="eyebrow">A WORD FOR PRAYER</div><blockquote>“Be careful for nothing; but in every thing by prayer and supplication with thanksgiving let your requests be made known unto God.”</blockquote><strong style="color:var(--gold)">Philippians 4:6 · KJV</strong><hr style="border:0;border-top:1px solid var(--line);margin:24px 0"><h3>Prayer reminders</h3><p style="font-size:12px;color:var(--muted)">Browser notification permission is only requested when you enable reminders.</p><button class="secondary-btn" id="prayerReminder">Set reminder</button></aside></div></div>`;$('#newPrayer').onclick=()=>openPrayerForm();if($('#emptyPrayer'))$('#emptyPrayer').onclick=()=>openPrayerForm();$$('[data-prayer-menu]').forEach(b=>b.onclick=()=>editPrayer(+b.dataset.prayerMenu));$('#prayerReminder').onclick=openReminder}
function openPrayerForm(v=null,p=null,index=-1){modal(`<div class="modal-head"><div><h2>${p?'Edit':'New'} prayer</h2><p>Private to your local profile</p></div><button class="close-btn" data-close>×</button></div>${v?`<div class="notice" style="margin-bottom:14px">Inspired by ${esc(v.ref)}: “${esc(v.text)}”</div>`:''}<div class="form-grid"><div class="field full"><label>Prayer title</label><input id="prayerTitle" value="${esc(p?.title||'')}" placeholder="What are you praying about?"/></div><div class="field full"><label>Prayer</label><textarea id="prayerBody" placeholder="Write your prayer…">${esc(p?.body||(v?`Lord, help me live in light of ${v.ref}. `:''))}</textarea></div><div class="field"><label>Category</label><select id="prayerCat">${['Personal','Family','Marriage','Career','Ministry','Finances','Wisdom','Thanksgiving'].map(x=>`<option ${p?.category===x?'selected':''}>${x}</option>`).join('')}</select></div><div class="field"><label>Status</label><select id="prayerStatus">${['Praying','Waiting','Answered'].map(x=>`<option ${p?.status===x?'selected':''}>${x}</option>`).join('')}</select></div></div><div class="modal-actions">${p?'<button class="danger-btn" id="deletePrayer">Delete</button>':''}<button class="secondary-btn" data-close>Cancel</button><button class="primary-btn" id="savePrayer">Save prayer</button></div>`);$('#savePrayer').onclick=()=>{const x={title:$('#prayerTitle').value.trim()||'Untitled prayer',body:$('#prayerBody').value.trim(),category:$('#prayerCat').value,status:$('#prayerStatus').value,date:p?.date||today(),scripture:v?.ref||p?.scripture||''};if(index>=0)state.prayers[index]=x;else state.prayers.unshift(x);save();closeModal();toast('Prayer saved privately','success');if(route==='prayer')renderPrayer()};if($('#deletePrayer'))$('#deletePrayer').onclick=()=>{state.prayers.splice(index,1);save();closeModal();renderPrayer()}}
function editPrayer(i){openPrayerForm(null,state.prayers[i],i)}
function openReminder(){modal(`<div class="modal-head"><div><h2>Prayer reminder</h2><p>Prayer reminder time</p></div><button class="close-btn" data-close>×</button></div><div class="field"><label>Reminder time</label><input type="time" id="reminderTime" value="${state.profile.prayerTime||'07:00'}"></div><div class="notice" style="margin-top:15px">This reminder is stored on this device only. Kingdom Bible does not request the system notification permission and does not send anything to a server, so nothing is collected and nothing leaves your phone.</div><div class="modal-actions"><button class="primary-btn" id="saveReminder">Save preference</button></div>`);$('#saveReminder').onclick=()=>{state.profile.prayerTime=$('#reminderTime').value;save();closeModal();toast('Reminder preference saved')}}

/* DEVOTIONAL & PLANS */
function renderDevotional(){setTitle('Devotional');const done=state.devotionalDone.includes(today());$('#main').innerHTML=`<div class="page"><article class="devotional-feature card"><div class="eyebrow">TODAY’S DEVOTIONAL · ${fmtDate()}</div><h1>${DEVOTIONAL.title}</h1><p class="scripture">“${DEVOTIONAL.verse}” — ${DEVOTIONAL.scripture}</p><div style="display:flex;gap:8px;margin-top:25px"><button class="primary-btn" id="devSave">${done?'✓ Completed':'Mark completed'}</button><button class="secondary-btn" id="devShare" style="background:rgba(255,255,255,.08);color:white;border-color:rgba(255,255,255,.15)">↗ Share</button></div></article><article class="card devotional-content"><div class="eyebrow">REFLECTION · 5 MIN READ</div><h2>A faithful next step</h2>${DEVOTIONAL.message.map(p=>`<p>${p}</p>`).join('')}<h2>Reflect</h2><p>${DEVOTIONAL.reflection}</p><h2>Prayer</h2><p>${DEVOTIONAL.prayer}</p><h2>Action point</h2><div class="notice">${DEVOTIONAL.action}</div><div style="margin-top:25px"><button class="secondary-btn" id="openDevScripture">Open ${DEVOTIONAL.scripture} in Bible</button></div></article></div>`;$('#devSave').onclick=()=>{if(!state.devotionalDone.includes(today()))state.devotionalDone.push(today());save();renderDevotional();toast('Devotional completed','success')};$('#devShare').onclick=()=>shareText(`${DEVOTIONAL.title}\n${DEVOTIONAL.verse}\n— ${DEVOTIONAL.scripture}\n\n${DEVOTIONAL.message[0]}`);$('#openDevScripture').onclick=()=>openReference(DEVOTIONAL.scripture)}
function renderPlans(){setTitle('Reading Plans');$('#main').innerHTML=`<div class="page"><div class="welcome-row"><div><div class="eyebrow">READ WITH PURPOSE</div><h1 class="hero-title">Reading Plans</h1><p class="lead">Build a steady Scripture rhythm without turning progress into a measure of spiritual worth.</p></div><button class="secondary-btn" id="customPlan">＋ Custom plan</button></div><div class="plan-grid">${PLANS.map(p=>{const n=state.planProgress[p.id]||0,pc=Math.round(n/p.days*100);return `<article class="card plan-card"><div class="plan-icon">${p.icon}</div><h3>${p.name}</h3><p>${p.desc}</p><div class="plan-meta"><span>${p.days} days</span><span>${n?pc+'% complete':'Not started'}</span></div><div class="progress"><span style="width:${pc}%"></span></div><button class="${n?'secondary-btn':'primary-btn'} small-btn" style="margin-top:13px" data-plan="${p.id}">${n?'Continue':'Start plan'}</button></article>`}).join('')}</div></div>`;$$('[data-plan]').forEach(b=>b.onclick=()=>openPlan(b.dataset.plan));$('#customPlan').onclick=()=>toast('Custom plan builder is coming soon')}
function openPlan(id){const p=PLANS.find(x=>x.id===id),n=state.planProgress[id]||0;modal(`<div class="modal-head"><div><div class="eyebrow">DAY ${Math.min(n+1,p.days)} OF ${p.days}</div><h2>${p.name}</h2></div><button class="close-btn" data-close>×</button></div><div class="progress"><span style="width:${Math.round(n/p.days*100)}%"></span></div><div class="card" style="box-shadow:none;margin-top:18px;padding:18px"><strong>Today’s reading</strong><p style="font-family:var(--scripture);font-size:20px">${planReading(id,n)}</p><p style="color:var(--muted);font-size:12px">Read prayerfully and in context. Progress is personal, not competitive.</p></div><div class="modal-actions"><button class="secondary-btn" id="openPlanRead">Open reading</button><button class="primary-btn" id="completePlanDay" ${n>=p.days?'disabled':''}>${n>=p.days?'Plan complete':'Mark day complete'}</button></div>`);const rr=planReading(id,n).split('–')[0];$('#openPlanRead').onclick=()=>openReference(rr.includes(':')?rr:rr+' 1');$('#completePlanDay').onclick=()=>{state.planProgress[id]=Math.min(p.days,n+1);save();closeModal();renderPlans();toast('Today’s reading marked complete','success')}}
function planReading(id,n){if(id==='psalms30')return `Psalms ${n*5+1}–${Math.min(150,n*5+5)}`;if(id==='proverbs31')return `Proverbs ${Math.min(31,n+1)}`;if(id==='gospels30')return `${['Matthew','Mark','Luke','John'][Math.floor(n/8)%4]} ${n%8+1}`;if(id==='nt90')return `${books[39+(n%27)].name} ${n%books[39+(n%27)].chapters+1}`;if(id==='year')return `Genesis ${n%50+1}`;const refs=['Hebrews 11:1','Philippians 4:6','Matthew 6:33','Romans 8:28','John 15:5','Psalms 46:1','James 1:5'];return refs[n%refs.length]}

/* MINISTRY */
async function renderMinistry(){setTitle('Ministry Mode','KINGDOM BIBLE');await loadHub();if(hub().isLive(hubState))await ensureSession();let cur=state.ministry.current||await getVerse('John 3:16');state.ministry.current=cur;save();$('#main').innerHTML=`<div class="page"><section class="ministry-hero"><div class="eyebrow">PROFESSIONAL SCRIPTURE PRESENTATION</div><h1>Ministry Mode</h1><p>Present Scripture beautifully for services, sermons, Bible studies, projectors, OBS, and vMix browser sources.</p><div style="display:flex;gap:9px;flex-wrap:wrap;margin-top:22px"><button class="primary-btn" id="openDisplay">▣ Open audience display</button><button class="secondary-btn" id="copyDisplay" style="background:rgba(255,255,255,.08);color:white;border-color:rgba(255,255,255,.15)">Copy browser-source URL</button><button class="secondary-btn" id="openManual" style="background:rgba(255,255,255,.08);color:white;border-color:rgba(255,255,255,.15)">? User Manual</button></div></section>${window.KingdomVoice?window.KingdomVoice.cardHtml():''}${connectCardHtml()}<div class="ministry-grid"><section class="card control-card"><div class="section-head" style="margin:0 0 14px"><div><h2>Presenter control</h2><p>Live preview · updates audience display instantly</p></div><span class="pill">${hub().isLive(hubState)?'<span class="status-dot"></span> Live session':'<span class="status-dot off"></span> This computer only'}</span></div><div class="control-preview ${state.ministry.theme==='light'?'light':state.ministry.theme==='royal'?'royal':''}" id="controlPreview"><blockquote>“${esc(cur.text)}”</blockquote><cite>${esc(cur.ref)} · ${TR[cur.translation||state.reader.translation]}</cite><div class="church-label">${esc(state.ministry.church)}</div></div><div class="control-actions"><button class="secondary-btn" id="minPrev">← Previous</button><button class="primary-btn" id="minSearch">⌕ Change Scripture</button><button class="secondary-btn" id="minNext">Next →</button><button class="secondary-btn" id="minBlank">Blank screen</button></div><div class="form-grid" style="margin-top:16px"><div class="field"><label>Theme</label><select id="minTheme"><option value="royal">Royal Gold</option><option value="dark">Classic Black</option><option value="light">Minimal White</option><option value="sunset">Sunset</option><option value="noir">Noir</option><option value="transparent">Transparent (key)</option></select></div><div class="field"><label>Church / ministry name</label><input id="minChurch" value="${esc(state.ministry.church)}"></div></div></section><aside class="card service-panel"><div class="eyebrow">LIVE SERVICE</div><h2>${esc(state.ministry.sermon||'Sunday Service')}</h2><div class="timer" id="serviceTimer">00:00:00</div><div style="display:flex;gap:8px"><button class="secondary-btn small-btn" id="timerStart">Start timer</button><button class="secondary-btn small-btn" id="timerReset">Reset</button></div><div class="connection" style="margin-top:18px"><span class="status-dot${hub().isLive(hubState)?'':' off'}"></span><span>${hub().isLive(hubState)?'Audience display sync is ready':'Audience display syncs on this computer only'}</span></div><div class="section-head"><div><h2>Media quick start</h2></div></div><button class="secondary-btn" style="width:100%;margin-bottom:8px" id="guideVmix">How to use with vMix</button><button class="secondary-btn" style="width:100%" id="guideObs">How to use with OBS</button></aside></div></div>`;
  $('#minTheme').value=state.ministry.theme;$('#openDisplay').onclick=()=>window.open(displayUrl(),'kingdomPresentation','width=1280,height=720');$('#copyDisplay').onclick=()=>copyText(displayUrl(),'Browser-source URL copied — paste it into vMix / OBS');$('#openManual').onclick=openManual;$('#minSearch').onclick=openMinistrySearch;$('#minPrev').onclick=()=>minStep(-1);$('#minNext').onclick=()=>minStep(1);$('#minBlank').onclick=()=>sendPresentation({...cur,blank:true});$('#minTheme').onchange=e=>{state.ministry.theme=e.target.value;save();sendPresentation(cur);renderMinistry()};$('#minChurch').onchange=e=>{state.ministry.church=e.target.value.trim()||'KINGDOM BIBLE';save();sendPresentation(cur)};$('#guideVmix').onclick=()=>openGuide('vMix');$('#guideObs').onclick=()=>openGuide('OBS');bindConnectCard();bindTimer();bindVoice()}
/* Repaint only the presenter preview — Voice Mode fires many updates per
   minute and a full re-render would flicker and tear down the mic UI. */
function updateMinistryPreview(v){
  const el=$('#controlPreview');if(!el||!v)return;
  el.innerHTML=`<blockquote>“${esc(v.text)}”</blockquote><cite>${esc(v.ref)} · ${TR[v.translation||state.reader.translation]}</cite><div class="church-label">${esc(state.ministry.church)}</div>`;
}
/* resolve + present a parsed reference (used by Voice Preacher Mode) */
async function presentHit(hit,tr){
  const v=await getPassage(hit,tr||state.reader.translation);
  if(!v)return null;
  state.ministry.current=v;save();
  await sendPresentation(v);
  updateMinistryPreview(v);
  return v;
}
function bindVoice(){
  if(!window.KingdomVoice)return;
  KingdomVoice.bind({
    books,
    present:(hit,tr)=>presentHit(hit,tr),
    /* "…now verse 25": jump inside the passage currently on the display */
    gotoVerse:(verse,verseEnd,tr)=>{
      const cur=state.ministry.current;
      if(!cur||cur.book==null)return null;
      return presentHit({book:cur.book,chapter:cur.chapter,verse,verseEnd:verseEnd||null},tr||cur.translation);
    },
    next:()=>minStep(1,true),
    prev:()=>minStep(-1,true),
    blank:()=>{const c=state.ministry.current;if(c)return sendPresentation({...c,blank:true})},
    show:()=>{const c=state.ministry.current;if(c)return sendPresentation(c)},
    notify:toast,
  });
}
async function openMinistrySearch(){modal(`<div class="modal-head"><div><h2>Send Scripture live</h2><p>A verse (Romans 8:28), a range (John 3:16-18) or a whole chapter (Psalm 23)</p></div><button class="close-btn" data-close>×</button></div><form id="minRefForm"><div class="field"><label>Scripture reference</label><input id="minRef" placeholder="John 3:16 · jn 3 16 · 1 John 2:5 · Psalm 23"/></div><div class="field" style="margin-top:12px"><label>Translation</label><select id="minTr">${translationOptions(state.reader.translation)}</select></div><div class="modal-actions"><button class="primary-btn">Send to display</button></div></form>`);$('#minRefForm').onsubmit=async e=>{e.preventDefault();const raw=$('#minRef').value.trim();const p=parseRef(raw);if(!p){toast(`Could not recognise “${raw}” — try a form like John 3:16 or jn 3 16`,'error');return}const v=await getPassage(p,$('#minTr').value);if(!v){toast(`${books[p.book].name} ${p.chapter}${p.verse?':'+p.verse:''} is outside this chapter — ${books[p.book].name} ${p.chapter} has fewer verses`,'error');return}state.ministry.current=v;save();await sendPresentation(v);closeModal();renderMinistry();toast(`${v.ref} is live`,'success')}}
/* Delegate step navigation to the server so it can cross chapter and book boundaries.
   Without a hub there is no server to ask, so walk the canon locally from the same
   bundled data — the presenter must never press "Next" on a stage and get nothing. */
async function minStep(d,quiet){
  if(!hub().isLive(hubState))return localStep(d,quiet);
  const out=await sessionAction({type:d>0?'next':'prev'});
  if(out&&out.ok!==false&&out.error)return toast(out.error,'error');
  await syncFromHub();
  if(quiet)updateMinistryPreview(state.ministry.current);else renderMinistry();
  return state.ministry.current;
}
/* Local equivalent of the hub's next/prev, crossing chapter and book boundaries. */
async function localStep(d,quiet){
  const cur=state.ministry.current;
  if(!cur||cur.book==null)return toast('Send a verse first','error');
  const tr=cur.translation||state.reader.translation;
  /* after a range, "next" continues from the END of the range */
  let bi=cur.book,ch=cur.chapter,v=(d>0?(cur.verseEnd||cur.verse||1):(cur.verse||1))+d;
  if(v<1){
    if(ch===1){if(bi===0)return toast('Start of the Bible','error');bi--;ch=books[bi].chapters}
    else ch--;
    v=(await loadBook(tr,bi)).chapters[ch-1].length;
  }
  if(v>(await loadBook(tr,bi)).chapters[ch-1].length){
    if(ch>=books[bi].chapters){if(bi>=books.length-1)return toast('End of the Bible','error');bi++;ch=1}
    else ch++;
    v=1;
  }
  const next=await getPassage({book:bi,chapter:ch,verse:v,verseEnd:null},tr);
  if(!next||!next.text)return toast('Cannot advance','error');
  state.ministry.current=next;save();
  await sendPresentation(next);
  if(quiet)updateMinistryPreview(next);else renderMinistry();
  return next;
}
async function syncFromHub(){
  if(!sessionCode)return;
  try{
    const d=await(await fetch('/api/session/status',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code:sessionCode})})).json();
    const p=d.presentation;
    if(p&&p.ref){state.ministry.current=p;save();if(p.theme)state.ministry.theme=p.theme;if(p.church)state.ministry.church=p.church}
  }catch{}
}
async function sendPresentation(v){const payload={...v,theme:state.ministry.theme,church:state.ministry.church,ts:Date.now()};
  localStorage.setItem('kingdomPresentation',JSON.stringify(payload));
  /* live session drives the display and every paired phone */
  if(sessionCode)await sessionAction({type:'presentation',payload:{...payload,book:payload.book,chapter:payload.chapter,verse:payload.verse,verseEnd:payload.verseEnd}});
  try{new BroadcastChannel('kingdom-presentation').postMessage(payload)}catch{}
}

/* ---------- live service session (presenter side) ----------
   The phone remote, the service code, the SSE stream and server-side verse
   resolution all live in the local Node hub. On a static host (Vercel) those
   routes do not exist, so hub-probe.js tells us which world we are in before
   anything is rendered. Never infer it from a status code: a static host
   answers /health with 200 text/html. */
let sessionCode=null,netInfo=null,hubState='checking';
const HUB_PORT=4173;
/* If hub-probe.js ever fails to load, fail closed: never claim a live session, and
   still tell the presenter exactly what to do rather than rendering an empty card. */
const HUB_FALLBACK={PORT:HUB_PORT,isLive:()=>false,probe:async()=>'static',
  describe:()=>({title:'Phone remote needs the ministry hub',
    body:'The live service is served by the ministry computer itself.',
    hint:'Run "npm start" on the ministry computer and open the LAN address it prints.',
    steps:['Open the KINGDOM BIBLE folder in a terminal.','Run `npm start`.',
           'Open the LAN address it prints, then choose "Check again".'],
    launchUrl:'http://localhost:'+HUB_PORT})};
function hub(){return window.KingdomHub||HUB_FALLBACK}
async function loadHub(){
  try{hubState=await hub().probe()}catch{hubState='static'}
  if(hub().isLive(hubState))await loadNet();
  return hubState;
}
async function loadNet(){try{netInfo=await(await fetch('/api/network',{cache:'no-store'})).json()}catch{netInfo=null}}
/* The audience display must be reachable from the projector machine and the phone,
   so it always uses the LAN origin + the live code — never localhost, never code-less. */
function lanOrigin(){const a=netInfo&&netInfo.addresses&&netInfo.addresses[0];return a?`http://${a}:${netInfo.port}`:location.origin}
function remoteUrl(){return lanOrigin()+'/remote'+(sessionCode?'?code='+encodeURIComponent(sessionCode):'')}
function displayUrl(){return lanOrigin()+'/present'+(sessionCode?'?code='+encodeURIComponent(sessionCode):'')}
async function ensureSession(){
  if(sessionCode)return sessionCode;
  /* only a proven live hub can mint or validate a code */
  if(!hub().isLive(hubState))return null;
  /* reuse the code already in storage: rotating it would drop every paired phone
     and any vMix input that is mid-service. Only mint a new one when it is invalid. */
  const known=localStorage.getItem('kingdomCode');
  if(known){
    /* A transport failure is NOT proof the code is stale. Only an explicit
       rejection may retire it — otherwise a brief Wi-Fi blip would orphan every
       paired phone and a vMix input that is mid-service. */
    let rejected=false;
    try{
      const r=await fetch('/api/session/status',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code:known})});
      if(r.status===401)rejected=true;
      else{const d=await r.json();if(d.ok){sessionCode=known;return sessionCode}}
    }catch{}
    if(!rejected)return known;
    localStorage.removeItem('kingdomCode');
  }
  try{
    const r=await(await fetch('/api/session/start',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({})})).json();
    if(r.ok){sessionCode=r.code;localStorage.setItem('kingdomCode',r.code);return r.code}
  }catch{}
  return null;
}
async function sessionAction(action){
  if(!sessionCode)return null;
  try{return await(await fetch('/api/remote/action',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code:sessionCode,action})})).json()}
  catch{return null}
}
async function copyText(t,msg){try{await navigator.clipboard.writeText(t);toast(msg||'Copied')}catch{toast('Copy failed — select manually')}}

/* draw a QR code onto a canvas (quiet zone of 4 modules per spec) */
function drawQR(text,canvas){
  if(!canvas||!window.QR)return false;
  let out;
  try{out=window.QR(text)}catch(e){return false}
  const{matrix,size}=out,quiet=4,total=size+quiet*2,scale=Math.max(2,Math.floor(320/total));
  canvas.width=total*scale;canvas.height=total*scale;
  canvas.style.width=total*scale+'px';canvas.style.height=total*scale+'px';
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle='#0b1220';
  for(let r=0;r<size;r++)for(let c=0;c<size;c++)
    if(matrix[r][c])ctx.fillRect((c+quiet)*scale,(r+quiet)*scale,scale,scale);
  return true;
}

/* presenter-facing connection card: code + QR + LAN address
   Three honest states. The old version rendered a green "Live" pill, a dashed
   "------" code and a blank white QR box whenever the hub was missing, which is
   exactly what the static Vercel deployment showed. Never claim a live session
   that does not exist, and never render a placeholder that looks scannable. */
function connectCardHtml(){
  const live=hub().isLive(hubState);
  if(!live){
    const d=hub().describe(hubState)||{};
    return `<section class="card connect-card hub-offline-card">
  <div class="section-head" style="margin:0 0 14px">
    <div><h2>${esc(d.title||'Connect the ministry hub')}</h2><p>Scan the code, or type the address on any phone on this Wi-Fi</p></div>
    <span class="pill hub-pill-off"><span class="status-dot off"></span> Hub offline</span>
  </div>
  <div class="connect-body">
    <div class="connect-info" style="width:100%">
      <p class="hub-lead">${esc(d.body||'')}</p>
      <ol class="hub-steps">${(d.steps||[]).map(s=>`<li>${esc(s).replace(/`([^`]+)`/g,'<code>$1</code>')}</li>`).join('')}</ol>
      <div class="hub-actions">
        <button class="primary-btn small-btn" id="hubRetry">Check again</button>
        <a class="secondary-btn small-btn" href="${esc(d.launchUrl||'http://localhost:'+HUB_PORT)}" id="hubLaunch">Open the local hub</a>
      </div>
      <p class="hint" id="netHint">${esc(d.hint||'')}</p>
    </div>
  </div></section>`;
  }
  const addr=netInfo&&netInfo.addresses&&netInfo.addresses[0];
  const port=(netInfo&&netInfo.port)||HUB_PORT;
  /* A localhost URL is useful only on the ministry computer. Never put it in a
     phone QR code: make the operator use the real LAN address or fix Wi-Fi first. */
  const localHost=['localhost','127.0.0.1','::1'].includes(location.hostname);
  const origin=addr?`http://${addr}:${port}`:(localHost?'':location.origin);
  const code=sessionCode||'------';
  const url=origin?origin+'/remote?code='+encodeURIComponent(sessionCode||''):'';
  const ready=!!(origin&&sessionCode);
  return `<section class="card connect-card ${ready?'':'hub-offline-card'}">
  <div class="section-head" style="margin:0 0 14px">
    <div><h2>${ready?'Connect a phone remote':'Phone remote needs a LAN address'}</h2><p>${ready?'Use the QR, the direct link, or enter the address and code manually.':'The service is running, but this computer has not exposed a phone-reachable Wi-Fi address yet.'}</p></div>
    <span class="pill ${ready?'premium-pill':'hub-pill-off'}"><span class="status-dot${ready?'':' off'}"></span> ${ready?'Live':'Needs Wi-Fi'}</span>
  </div>
  <div class="connect-body">
    ${ready?'<div class="qr-wrap"><canvas id="sessionQr" width="160" height="160" aria-label="QR code to open the phone remote"></canvas><span class="qr-cap">Scan to open</span></div>':''}
    <div class="connect-info" style="width:100%">
      <div class="code-row">
        <div class="code-box"><label>Service code</label><strong id="sessionCode">${esc(code)}</strong></div>
        <button class="secondary-btn small-btn" id="copyCode">Copy code</button>
      </div>
      <div class="field" style="margin-top:12px"><label>Direct phone link</label>
        <div class="url-row"><input id="sessionUrl" readonly value="${esc(url||'No LAN address detected')}"><button class="secondary-btn small-btn" id="copyUrl" ${ready?'':'disabled'}>Copy link</button></div>
      </div>
      ${ready?'<div class="connect-actions"><button class="primary-btn small-btn" id="openPhoneRemote">Open phone remote</button><span class="hint">If scanning fails, copy the full link above. It already contains the service code.</span></div>':`<ol class="hub-steps"><li>Connect the ministry computer to the same Wi-Fi as the phone.</li><li>Open the app from the computer's LAN address, not localhost.</li><li>If no address appears, allow Node.js through the firewall and choose “Check again”.</li></ol>`}
      <p class="hint" id="netHint">${ready?'Both devices must be on the same Wi-Fi. If the phone cannot connect, allow Node.js through the firewall on port '+port+' and avoid guest Wi-Fi isolation.':'The QR is intentionally hidden until a real LAN link is available, so the phone is never sent to localhost.'}</p>
    </div>
  </div></section>`;
}
function bindConnectCard(){
  const retry=$('#hubRetry');
  if(retry)retry.onclick=async()=>{retry.disabled=true;retry.textContent='Checking…';await loadHub();if(hub().isLive(hubState))await ensureSession();renderMinistry();toast(hub().isLive(hubState)?'Ministry hub connected':'The ministry hub is still not running',hub().isLive(hubState)?'success':'error')};
  const urlEl=$('#sessionUrl');
  const full=urlEl&&/^https?:\/\//.test(urlEl.value)?urlEl.value:'';
  /* The QR and the old copy-link flow now use exactly the same direct URL. The
     code is embedded once, so scanning never lands on a code-less remote page. */
  if(full&&sessionCode)drawQR(full,$('#sessionQr'));
  else $('.qr-wrap')?.remove();
  const cc=$('#copyCode');if(cc)cc.onclick=()=>copyText(sessionCode,'Service code copied');
  const cu=$('#copyUrl');if(cu)cu.onclick=()=>copyText(full,'Phone link copied');
  const op=$('#openPhoneRemote');if(op)op.onclick=()=>window.open(full,'kingdomRemote','width=420,height=820');
}
function bindTimer(){let sec=0,id=null;const out=$('#serviceTimer'),draw=()=>out.textContent=new Date(sec*1000).toISOString().slice(11,19);$('#timerStart').onclick=e=>{if(id){clearInterval(id);id=null;e.target.textContent='Start timer'}else{id=setInterval(()=>{sec++;draw()},1000);e.target.textContent='Pause'}};$('#timerReset').onclick=()=>{sec=0;draw()}}
function openGuide(type){const vm=type==='vMix';modal(`<div class="modal-head"><div><h2>Use KINGDOM BIBLE with ${type}</h2><p>Browser-source quick start</p></div><button class="close-btn" data-close>×</button></div><div class="guide-steps">${(vm?['Create or open the Ministry Mode session.','Copy the browser-source URL.','Open vMix and choose Add Input → Web Browser.','Paste the URL and set 1920 × 1080.','Open the audience display or presenter control.','Search Scripture and send verses live.']:['Create or open the Ministry Mode session.','Copy the browser-source URL.','In OBS, add a Browser Source.','Paste the URL and set 1920 × 1080.','For transparency, choose the Transparent theme.','Use Presenter Control to send verses live.']).map(x=>`<div class="guide-step">${x}</div>`).join('')}</div><div class="notice" style="margin-top:15px">The presentation route contains no controls and is suitable for capture. Keep this control page private.</div>`)}
/* ---------- audience display (vMix / OBS capture surface) ----------
   The stage is a fixed viewport that must never scroll or crop: a verse that runs off
   the bottom is a bug on a projector. Fitting happens in two stages.
   1. Search the font size (binary search) down to a readability floor, so ordinary
      passages stay as large as possible.
   2. If even the floor overflows — a whole chapter in a small browser source, say —
      scale the whole block down uniformly with a transform, which is the only way to
      keep long text inside the frame without making it unreadably small line-by-line.
   Measuring scrollHeight after each trial keeps this reliable across the different
   engines vMix and OBS ship. */
function fitText(box,stage,maxPx,minPx){
  const quote=box.querySelector('blockquote');
  if(!quote)return 0;
  box.style.transform='';
  quote.style.fontSize='';
  /* the block must fit inside the stage minus the citation and brand gutters */
  const cs=getComputedStyle(stage);
  const chrome=(parseFloat(cs.paddingTop)||0)+(parseFloat(cs.paddingBottom)||0)
    +(box.querySelector('cite')?.offsetHeight||0)+(stage.querySelector('.presentation-brand')?.offsetHeight||0);
  const budget=Math.max(80,stage.clientHeight-chrome-(stage.clientHeight*0.06));
  let hi=Math.min(maxPx,parseFloat(getComputedStyle(quote).fontSize)||maxPx);
  let lo=minPx;
  if(quote.scrollHeight>budget){
    for(let i=0;i<8&&hi-lo>1;i++){
      const mid=(hi+lo)/2;
      quote.style.fontSize=mid+'px';
      if(quote.scrollHeight<=budget)lo=mid;else hi=mid;
    }
    quote.style.fontSize=lo+'px';
  }else quote.style.fontSize=hi+'px';
  /* stage 2: the floor did not save us, so scale the rendered block to the frame.
     The 0.995 keeps sub-pixel rounding on the safe side of the budget. */
  const used=box.scrollHeight;
  if(used>budget){
    const k=Math.max(0.2,(budget/used)*0.995);
    box.style.transform='scale('+k.toFixed(4)+')';
  }
  return parseFloat(quote.style.fontSize);
}
async function renderPresentation(){
    const DEBUG=/[?&]debug=1/.test(location.search);
    document.body.className='presentation-body'+(DEBUG?' is-debug':'');
    document.body.innerHTML=`<div class="presentation-stage royal" id="stage"><div class="presentation-status" id="stageStatus"></div><div class="presentation-verse" id="stageVerse"><blockquote>Waiting for Scripture…</blockquote><cite>KINGDOM BIBLE</cite></div><div class="presentation-brand" id="stageBrand">KINGDOM BIBLE</div><div class="presentation-hint" id="stageHint"></div></div>`;

    /* Belt-and-braces with the CSS: capture browsers still synthesise mouse events. */
    const kill=e=>e.preventDefault();
    document.addEventListener('selectstart',kill);
    document.addEventListener('contextmenu',kill);
    document.addEventListener('dragstart',kill);
    document.addEventListener('mouseup',()=>window.getSelection()&&window.getSelection().removeAllRanges());
    document.addEventListener('selectionchange',()=>{if(document.activeElement&&/INPUT|TEXTAREA/.test(document.activeElement.tagName))return;const s=window.getSelection();if(s&&!s.isCollapsed)s.removeAllRanges()});

    const stage=$('#stage'),verseBox=$('#stageVerse'),brand=$('#stageBrand'),hint=$('#stageHint');
    /* a multi-verse passage needs a smaller ceiling than a single verse */
    const fit=p=>verseBox.classList.contains('is-blank')?0:fitText(verseBox,stage,p&&p.multiverse?56:94,14);
    const apply=p=>{
      if(!p)return;
      stage.className='presentation-stage '+(p.theme||'royal');
      /* the keying theme must clear the body too or vMix composites #020617 behind the verse */
      document.body.className='presentation-body'+(p.theme==='transparent'?' is-key':'')+(DEBUG?' is-debug':'');
      brand.textContent=p.church||'KINGDOM BIBLE';
      if(p.blank||!p.text){
        verseBox.innerHTML='<blockquote></blockquote><cite></cite>';
        verseBox.classList.toggle('is-blank',true);
      }else{
        const vs=Array.isArray(p.verses)&&p.verses.length?p.verses:null;
        const body=vs?vs.map(v=>`<sup class="vnum">${v.n}</sup>${esc(v.text)}`).join(' '):esc(p.text);
        verseBox.classList.toggle('is-blank',false);
        verseBox.classList.toggle('is-multiverse',!!vs);
        verseBox.innerHTML=`<blockquote>“${body}”</blockquote><cite>${esc(p.ref||p.label||'')} · ${esc(TR[p.translation]||String(p.translation||'').toUpperCase())}</cite>`;
      }
      /* shrink long passages so nothing is ever cropped by the capture frame */
      fit(Object.assign({},p,{multiverse:Array.isArray(p.verses)&&p.verses.length>1}));
    };
    /* vMix and OBS resize the browser input live; re-fit so nothing is ever cropped */
    let fitTimer=null;
    addEventListener('resize',()=>{clearTimeout(fitTimer);fitTimer=setTimeout(()=>fit({multiverse:verseBox.classList.contains('is-multiverse')}),120)});

    const code=new URLSearchParams(location.search).get('code')||localStorage.getItem('kingdomCode');
    if(code){
      try{
        const d=await(await fetch('/api/session/status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code})})).json();
        if(d.ok){apply(d.presentation);hint.textContent='';hint.className='presentation-hint';
          const es=new EventSource('/api/stream?code='+encodeURIComponent(code));
          es.addEventListener('presentation',e=>apply(JSON.parse(e.data)));
          es.addEventListener('hello',e=>{const s=JSON.parse(e.data);apply(s.presentation)});
          es.onerror=()=>{$('#stageStatus').style.background='#dc2626'};
          es.onopen=()=>{$('#stageStatus').style.background='#16a34a'};
          return}
      }catch{}
      hint.textContent='Session code not recognised — showing saved verse';
    }
    /* single-PC fallback (no service code in use) */
    try{
      const d=await(await fetch('/api/state')).json();
      if(d.presentation&&d.presentation.text)apply(d.presentation);
      else{const x=localStorage.getItem('kingdomPresentation');if(x)apply(JSON.parse(x))}
    }catch{const x=localStorage.getItem('kingdomPresentation');if(x)apply(JSON.parse(x))}
    window.addEventListener('storage',e=>{if(e.key==='kingdomPresentation')apply(JSON.parse(e.newValue))});
    try{const bc=new BroadcastChannel('kingdom-presentation');bc.onmessage=e=>apply(e.data)}catch{}
  }

/* PROFILE */
function renderProfile(){setTitle('Profile & Settings');const saved=Object.keys(state.bookmarks);$('#main').innerHTML=`<div class="page"><div class="card profile-header"><label class="avatar avatar-upload" title="Upload profile photo">${avatarMarkup()}<input id="profileAvatar" type="file" accept="image/png,image/jpeg,image/webp" hidden></label><div style="flex:1"><h1>${esc(state.profile.name)}</h1><p>Local profile · Personal data stored on this device</p></div><button class="secondary-btn" id="editProfile">Edit profile</button></div><div class="profile-layout" style="margin-top:18px"><nav class="card settings-nav"><button class="active">Overview</button><button>Appearance</button><button>Reading</button><button>Privacy</button><button>Data</button></nav><section class="card settings-content"><div class="eyebrow">YOUR LIBRARY</div><div class="home-stats" style="margin:15px 0 25px"><div class="stat-card"><div><strong>${state.chaptersRead.length}</strong><small>chapters</small></div></div><div class="stat-card"><div><strong>${saved.length}</strong><small>saved</small></div></div><div class="stat-card"><div><strong>${Object.keys(state.highlights).length}</strong><small>highlights</small></div></div><div class="stat-card"><div><strong>${Object.keys(state.notes).length}</strong><small>notes</small></div></div></div><div class="eyebrow">APPEARANCE</div><div class="setting-row"><div><h3>Theme</h3><p>Choose a comfortable reading environment.</p></div><div class="theme-options">${['light','dark','sepia','amoled','contrast'].map(t=>`<button class="theme-swatch ${state.profile.theme===t?'active':''}" data-theme-pick="${t}">${t[0].toUpperCase()+t.slice(1)}</button>`).join('')}</div></div><div class="setting-row"><div><h3>Preferred translation</h3><p>Only public-domain translations are included.</p></div><select class="reader-select" id="profileTr">${translationOptions(state.profile.translation)}</select></div><div class="setting-row"><div><h3>Install KINGDOM BIBLE</h3><p>Offline access and an app-like home-screen experience.</p></div><button class="secondary-btn" id="profileInstall">Install</button></div><div class="eyebrow" style="margin-top:25px">MEMBERSHIP & SUPPORT</div><div class="setting-row"><div><h3>Kingdom Bible Pro</h3><p>Start your 30-day trial, choose a plan, earn referral rewards, and manage withdrawals.</p></div><button class="primary-btn small-btn" id="profileUpgrade">View plans</button></div><div class="setting-row"><div><h3>Questions or enquiries</h3><p>Contact support directly on WhatsApp.</p></div><button class="secondary-btn small-btn" id="profileWhatsApp">WhatsApp</button></div><div class="eyebrow" style="margin-top:25px">HELP & SETUP</div><div class="setting-row"><div><h3>User Manual</h3><p>Learn navigation, reading, search, ministry, Voice Mode, remote control, and presentation setup.</p></div><button class="secondary-btn" id="profileManual">Open manual</button></div><div class="eyebrow" style="margin-top:25px">PRIVACY & DATA</div><div class="setting-row"><div><h3>Local-first privacy</h3><p>Notes, prayers, bookmarks, and history remain in this browser.</p></div><span class="pill"><span class="status-dot"></span> Private</span></div><div class="setting-row"><div><h3>Export personal data</h3><p>Download your profile data as JSON.</p></div><button class="secondary-btn" id="exportData">Export</button></div><div class="setting-row"><div><h3>Cloud account & sync</h3><p>Secure multi-device accounts are not connected in this local build.</p></div><span class="pill">Coming Soon</span></div><div class="setting-row"><div><h3>Clear local data</h3><p>Permanently remove personal activity from this browser.</p></div><button class="danger-btn small-btn" id="clearData">Clear</button></div></section></div></div>`;$('#editProfile').onclick=openEditProfile;$$('[data-theme-pick]').forEach(b=>b.onclick=()=>{state.profile.theme=b.dataset.themePick;save();renderProfile()});$('#profileTr').onchange=e=>{state.profile.translation=e.target.value;state.reader.translation=e.target.value;save();toast('Preferred translation updated')};$('#profileInstall').onclick=installApp;$('#profileManual').onclick=openManual;$('#profileUpgrade').onclick=()=>window.KingdomPremium?.open();$('#profileWhatsApp').onclick=()=>window.open('https://wa.me/23481344338808?text=Hello%20KINGDOM%20BIBLE%20support','_blank','noopener');const avatar=$('#profileAvatar');if(avatar)avatar.onchange=e=>{const f=e.target.files?.[0];if(!f)return;if(f.size>2*1024*1024){toast('Profile photo must be 2 MB or smaller','error');return}const r=new FileReader();r.onload=()=>{state.profile.avatar=String(r.result);save();renderProfile();toast('Profile photo updated','success')};r.readAsDataURL(f)};$('#exportData').onclick=exportData;$('#clearData').onclick=confirmClear}
function openEditProfile(){modal(`<div class="modal-head"><div><h2>Edit profile</h2><p>Personalize your local experience.</p></div><button class="close-btn" data-close>×</button></div><div class="form-grid"><div class="field full"><label>Name</label><input id="profileName" value="${esc(state.profile.name)}"></div><div class="field"><label>Reading time</label><input type="time" id="profileTime" value="${state.profile.readingTime}"></div><div class="field"><label>Translation</label><select id="editTr">${translationOptions(state.profile.translation)}</select></div></div><div class="modal-actions"><button class="primary-btn" id="saveProfile">Save profile</button></div>`);$('#saveProfile').onclick=()=>{state.profile.name=$('#profileName').value.trim()||'Reader';state.profile.readingTime=$('#profileTime').value;state.profile.translation=$('#editTr').value;save();closeModal();renderProfile();toast('Profile updated','success')}}
function exportData(){const blob=new Blob([JSON.stringify({...state,exportedAt:new Date().toISOString(),app:'KINGDOM BIBLE v1.0.0'},null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`kingdom-bible-data-${today()}.json`;a.click();URL.revokeObjectURL(a.href);toast('Personal data exported')}
function confirmClear(){modal(`<div class="modal-head"><div><h2>Clear local data?</h2><p>This cannot be undone.</p></div><button class="close-btn" data-close>×</button></div><p>This permanently removes bookmarks, notes, highlights, prayer entries, reading progress, and settings from this browser.</p><div class="modal-actions"><button class="secondary-btn" data-close>Cancel</button><button class="danger-btn" id="confirmClear">Clear everything</button></div>`);$('#confirmClear').onclick=()=>{localStorage.removeItem(LS);state=structuredClone(DEFAULT);save();closeModal();navigate('home');toast('Local data cleared')}}

/* MEMORY, COMMANDS, PWA */
function openMemory(v){let step=0;const words=v.text.split(' ');const draw=()=>{const hidden=words.map((w,i)=>step===0?w:step===1&&i%4===0?'_____':step===2&&i%2===0?'_____':step>=3?'_____':w).join(' ');modal(`<div class="modal-head"><div><div class="eyebrow">MEMORY PRACTICE · STEP ${step+1} OF 4</div><h2>${esc(v.ref)}</h2></div><button class="close-btn" data-close>×</button></div><div class="selected-passage" style="font:21px/1.9 var(--scripture)">${esc(hidden)}</div><p style="color:var(--muted);font-size:12px">${['Read the verse aloud slowly.','Recall the missing words.','More words are now hidden.','Recite the entire verse from memory.'][step]}</p><div class="modal-actions"><button class="secondary-btn" id="memoryReveal">Reveal</button><button class="primary-btn" id="memoryNext">${step===3?'Finish':'Next step'}</button></div>`);$('#memoryReveal').onclick=()=>{$('.selected-passage').textContent=v.text};$('#memoryNext').onclick=()=>{if(step<3){step++;draw()}else{closeModal();toast('Practice complete — keep returning to the Word','success')}}};draw()}
function openManual(){modal(`<div class="modal-head"><div><div class="eyebrow">KINGDOM BIBLE · USER MANUAL</div><h2>Read, study, and present the Word</h2><p>A practical guide for the reader, ministry team, and presentation operator.</p></div><button class="close-btn" data-close>×</button></div><div class="manual-content">
  <section><h3>Navigation</h3><p>Use the sidebar on desktop or the bottom navigation on a phone. Home gives you today’s activity; Bible opens the reader; Study, Prayer, Devotional, Plans, Ministry, and Profile keep those tools one tap away. The top search button opens the command palette.</p><p><strong>Keyboard:</strong> press <kbd>Ctrl</kbd> + <kbd>K</kbd> (or <kbd>⌘ K</kbd> on Mac) for navigation, recent searches, and this manual. The quick-action <strong>+</strong> button is available on smaller screens.</p></section>
  <section><h3>Reading the Bible</h3><p>Open <strong>Bible</strong>, choose a book and chapter, then choose KJV, ASV, or WEB. Use the chapter arrows to move through the canon. Reader settings control font, size, line spacing, and theme.</p><p>Select a verse to bookmark it, highlight it, add a note, share it, or use it to start a prayer. Your reading activity and personal notes stay in this browser.</p></section>
  <section><h3>Search and Scripture references</h3><p>Search by words or phrases in <strong>Search</strong>. You can also type references such as <strong>John 3:16</strong>, <strong>Jn 3 16</strong>, <strong>1 John 2:5</strong>, a range, or a whole chapter. Select a result to open it in the reader. Recent searches are available from the <kbd>Ctrl</kbd> + <kbd>K</kbd> palette.</p></section>
  <section><h3>Ministry setup</h3><p>Open <strong>Ministry</strong> to set the church name, translation, display theme, and live service. Choose <strong>Change Scripture</strong> to send a verse, range, or chapter to the audience display. <strong>Open audience display</strong> opens a clean capture surface; <strong>Copy browser-source URL</strong> copies the coded display address.</p><p>For phone control and live sync, run <code>npm start</code> on the ministry computer and open the local app at <code>http://localhost:4173</code>. For microphone use, the page must be <code>https://</code> or localhost.</p></section>
  <section><h3>Voice Preacher Mode</h3><p>On the Ministry page, open Voice Preacher Mode in Chrome or Edge, allow the microphone, and tap the mic. It scans interim speech frames: a complete book, chapter, and verse can reach the display while you keep speaking. Untick instant send if an operator should approve each reference first.</p><p><strong>Mic troubleshooting:</strong> If the wrong mic is selected, open the browser site settings and choose the intended microphone, not a webcam or a disconnected headset. In Windows/macOS sound settings, select the real input or the correct Voicemeeter output, confirm the input meter moves, and close other apps holding the mic. In Voicemeeter, check the hardware input, routing bus, mute buttons, and sample rate; then reload the page and allow the microphone again.</p><p><strong>Secure page:</strong> microphone access requires <code>https://</code> or <code>http://localhost</code>. A plain <code>http://192.168…</code> LAN address cannot use Voice Mode. The phone remote can still use the LAN address.</p></section>
  <section><h3>Phone remote and QR pairing</h3><p>Start a live session in Ministry. Scan the QR code shown in <strong>Connect a phone remote</strong>, or type the phone address, then enter the six-character service code. Keep the phone and ministry computer on the same Wi-Fi. The remote can send Scripture, move to the next or previous verse, blank the display, and change the look.</p><p>If it will not connect, turn off guest-network client isolation and allow Node.js through the computer’s firewall on the displayed port. Do not use <code>localhost</code> on the phone: it means the phone itself.</p></section>
  <section><h3>Pro membership, referrals, and support</h3><p>Choose <strong>Try Pro free</strong> on Home or open Profile → <strong>View plans</strong>. Every new account starts with 30 days; the app warns you when seven days remain. Plans are monthly and payments are processed through Paystack. The referral code in your account can earn ₦100 for a verified signup and 10% of the referred user’s first successful subscription payment. Wallet withdrawals start at ₦1,000, are reviewed by the administrator, and target payment within three working days.</p><p>Use <strong>WhatsApp support</strong> for enquiries, billing, privacy, or refund questions. Holding the Kingdom Bible logo for 2.5 seconds opens the admin sign-in page; only the configured administrator credentials can enter.</p></section>
  <section><h3>vMix and OBS</h3><p>In Ministry, copy the <strong>browser-source URL</strong>. In vMix choose <strong>Add Input → Web Browser</strong>; in OBS add a <strong>Browser Source</strong>. Paste the URL, use 1920 × 1080, and keep the service code in the URL. Do not paste a localhost address into vMix or OBS when they run on another machine.</p><p>Use the Transparent theme for a keyed overlay. The presentation route has no controls and is designed for capture; keep the presenter control page private.</p></section>
</div>`,'manual-modal')}
function openCommand(){const items=[...NAV,...QUICK.filter(q=>!NAV.some(n=>n[0]===q[0])),['manual','?','User Manual']];modal(`<input class="command-input" id="commandInput" placeholder="Search Scripture or go to a feature…"/><div class="command-results" id="commandResults"><div class="command-group">NAVIGATE</div>${items.map(x=>x[0]==='manual'?`<button class="command-item" data-cmanual><span>${x[1]}</span><strong>${x[2]}</strong><small>Open</small></button>`:`<button class="command-item" data-croute="${x[0]}"><span>${x[1]}</span><strong>${x[2]}</strong><small>Open</small></button>`).join('')}<div class="command-group">RECENT SEARCHES</div>${state.history.slice(0,4).map(x=>`<button class="command-item" data-csearch="${esc(x)}"><span>⌕</span><strong>${esc(x)}</strong><small>Search</small></button>`).join('')}</div>`,'command-modal');const input=$('#commandInput');input.oninput=()=>{const q=input.value.toLowerCase();$$('.command-item').forEach(x=>x.hidden=!x.textContent.toLowerCase().includes(q))};$$('[data-croute]').forEach(b=>b.onclick=()=>navigate(b.dataset.croute));$$('[data-cmanual]').forEach(b=>b.onclick=openManual);$$('[data-csearch]').forEach(b=>b.onclick=()=>{searchState.query=b.dataset.csearch;navigate('search');setTimeout(()=>performSearch(b.dataset.csearch),50)});input.onkeydown=e=>{if(e.key==='Enter'&&input.value.trim()){searchState.query=input.value.trim();navigate('search');setTimeout(()=>performSearch(input.value.trim()),50)}}}
function openQuick(){if($('.quick-menu')){closeModal();return}modal(`<div class="eyebrow" style="padding:8px">QUICK ACTIONS</div>${[['search','⌕','Search Bible'],['prayer','♧','Start prayer'],['bible','✎','Add Scripture note'],['study','✦','Start study'],['ministry','▣','Start presentation']].map(x=>`<button data-route="${x[0]}"><span>${x[1]}</span>${x[2]}</button>`).join('')}`,'quick-menu')}
function cycleTheme(){const a=['dark','light','sepia','amoled'],i=a.indexOf(state.profile.theme);state.profile.theme=a[(i+1)%a.length];save();toast(`${state.profile.theme[0].toUpperCase()+state.profile.theme.slice(1)} theme`)}
async function shareText(text){if(navigator.share)try{await navigator.share({title:'KINGDOM BIBLE',text})}catch{}else{await navigator.clipboard.writeText(text);toast('Copied for sharing')}closeModal()}
function registerPWA(){if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(console.warn);window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstall=e;$('#installBtn').hidden=false});$('#installBtn').onclick=installApp}
async function installApp(){if(deferredInstall){deferredInstall.prompt();await deferredInstall.userChoice;deferredInstall=null;$('#installBtn').hidden=true}else toast('Use your browser menu and choose “Install app” or “Add to Home Screen”.')}
function networkStatus(){const draw=()=>$('#offlineBar').hidden=navigator.onLine;addEventListener('online',draw);addEventListener('offline',draw);draw()}
init();
