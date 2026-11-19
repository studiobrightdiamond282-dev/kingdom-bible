#!/usr/bin/env node
'use strict';
/* KINGDOM BIBLE — local-first hub: static hosting, live Scripture presentation, phone remote control */
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto'),os=require('os');
const REF=require('./public/bible-ref.js');
const {SUPPORT_PHONE,SUPPORT_PHONE_DISPLAY,supportLink}=require('./config/site.js');
const ROOT=path.join(__dirname,'public'),DATA=path.join(__dirname,'data');
/* Dependency-free .env loader for local ministry servers. Deployment platforms
   should set the same values in their secret manager instead. */
(function loadDotEnv(file){try{if(!fs.existsSync(file))return;for(const line of fs.readFileSync(file,'utf8').split(/\r?\n/)){const m=line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^['"]|['"]$/g,'')}}catch{}})(path.join(__dirname,'.env'));
const PORT=Number(process.env.PORT||4173),HOST='0.0.0.0';
const APP='KINGDOM BIBLE',VERSION='1.2.12';
/* Static and server-rendered contact data comes from config/site.js. */
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.mp4':'video/mp4','.webm':'video/webm','.svg':'image/svg+xml','.txt':'text/plain; charset=utf-8','.xml':'application/xml; charset=utf-8'};
/* Absolute origin used for the link-preview urls (og:image and friends).
 * Every social crawler resolves a RELATIVE og:image against the url it was handed,
 * so index.html shipping "/assets/logo-hero.png" meant a shared hub link rendered
 * with no picture at all. PUBLIC_URL pins the canonical name when the hub is
 * reached under a different hostname than it is served on; otherwise the request's
 * own host is used, honouring x-forwarded-* so a proxy or tunnel in front of us
 * still yields an https url. The host is matched against a strict pattern before
 * being echoed into HTML, so a Host header cannot inject markup. */
const PUBLIC_URL=String(process.env.PUBLIC_URL||'').trim().replace(/\/+$/,'');
function publicOrigin(req){
  if(PUBLIC_URL)return PUBLIC_URL;
  const proto=String(req.headers['x-forwarded-proto']||'').split(',')[0].trim()||(req.socket.encrypted?'https':'http');
  const host=String(req.headers['x-forwarded-host']||req.headers.host||'').split(',')[0].trim();
  return /^[A-Za-z0-9.-]+(:\d{1,5})?$/.test(host)?proto+'://'+host:'';
}
const THEMES=['royal','dark','light','transparent','sunset','noir'];
const TRANSLATIONS=['kjv','asv','web'];
const MAX_VERSES=40;

function headers(res,type='application/json; charset=utf-8',frameable=false){
  res.setHeader('Content-Type',type);
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  /* microphone=(self) is required by Voice Preacher Mode; everything else stays denied */
  res.setHeader('Permissions-Policy','camera=(), microphone=(self), geolocation=(), usb=(), payment=()');
  /* ALLOWALL is not a real XFO value: when the page is meant to be captured/embedded,
     drop the legacy header entirely and let CSP frame-ancestors carry the policy. */
  if(!frameable)res.setHeader('X-Frame-Options','SAMEORIGIN');
  /* Google Identity Services loads its own stylesheet from accounts.gstatic.com.
     Without that origin in style-src the button renders unstyled or invisible, and
     the reader is left thinking sign-in is broken. Everything else stays locked to
     'self' - this widens the policy to two Google hosts, nothing more. */
  res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data: https://lh3.googleusercontent.com; style-src 'self' 'unsafe-inline' https://accounts.gstatic.com; font-src 'self' https://fonts.gstatic.com; script-src 'self' https://accounts.google.com; connect-src 'self' https://accounts.google.com; frame-src https://accounts.google.com; worker-src 'self'; base-uri 'self'; form-action 'self'; object-src 'none'"+(frameable?'; frame-ancestors *':''));
}
function json(res,status,data){res.statusCode=status;headers(res);res.end(JSON.stringify(data))}

const hits=new Map();
function rate(req,res,limit=300){
  const ip=req.socket.remoteAddress||'local',now=Date.now(),x=hits.get(ip)||{at:now,n:0};
  if(now-x.at>60000){x.at=now;x.n=0}x.n++;hits.set(ip,x);
  if(x.n>limit){json(res,429,{error:'Too many requests'});return false}
  return true;
}
function publicAnalyticsCors(req,res){
  const origin=String(req.headers.origin||'');
  if(!origin||!ANALYTICS_ALLOWED_ORIGINS.has(origin))return false;
  res.setHeader('Access-Control-Allow-Origin',origin);
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  res.setHeader('Access-Control-Max-Age','600');
  res.setHeader('Vary','Origin');
  return true;
}
/* JSON body reader.
   The default cap is deliberately small (20 KB) because almost every route here takes
   an email, a plan id or a scripture reference — a large body means something is wrong.
   The profile-photo route is the one legitimate exception and passes its own limit.
   An oversized body must NOT destroy the socket: that produces a bare "fetch failed"
   in the browser with no explanation, so we stop buffering, drain the rest and report
   a real 413 the UI can display. */
function body(req,limit=20000){
  return new Promise((resolve,reject)=>{
    let s='',over=false;
    req.on('data',c=>{
      if(over)return;
      s+=c;
      if(s.length>limit){over=true;s='';reject(Object.assign(Error('Payload too large'),{statusCode:413}))}
    });
    req.on('end',()=>{if(over)return;try{resolve(JSON.parse(s||'{}'))}catch{reject(Object.assign(Error('Invalid JSON'),{statusCode:400}))}});
    req.on('error',reject);
  });
}
/* Paystack webhook signatures cover the exact bytes sent, so keep this reader
   separate from body(), which parses JSON and would lose the signed byte sequence. */
function rawBody(req,limit=256*1024){
  return new Promise((resolve,reject)=>{
    const chunks=[];let length=0,over=false;
    req.on('data',chunk=>{
      if(over)return;
      length+=chunk.length;
      if(length>limit){over=true;chunks.length=0;reject(Object.assign(Error('Payload too large'),{statusCode:413}));return}
      chunks.push(chunk);
    });
    req.on('end',()=>{if(!over)resolve(Buffer.concat(chunks,length))});
    req.on('error',reject);
  });
}
/* Base64 data URLs inflate by ~4/3, so the transport allowance is larger than the
   decoded 512 KB ceiling enforced inside the profile route. */
const PHOTO_BODY_LIMIT=768*1024;

/* ---------- Scripture library: server-side resolver so phones never download 4 MB ---------- */
let _books=null,_bible={},_refCache=new Map();
function booksList(){return _books||(_books=JSON.parse(fs.readFileSync(path.join(DATA,'books.json'),'utf8')).books)}
function bibleData(tr){tr=TRANSLATIONS.includes(tr)?tr:'kjv';return _bible[tr]||(_bible[tr]=JSON.parse(fs.readFileSync(path.join(DATA,'bible_'+tr+'.json'),'utf8')))}

/* One reference grammar for the whole product: the same engine the browser,
   the phone remote and Voice Preacher Mode use (public/bible-ref.js).
   It understands "jn 3 16", "1john2:5", spoken forms and misspellings —
   exact -> prefix -> subsequence -> edit distance. */
function parseRef(input){
  const key=String(input||'').trim().toLowerCase();
  if(_refCache.has(key))return _refCache.get(key);
  const out=REF.parse(key,booksList());
  _refCache.set(key,out);return out;
}

/** Resolve "John 3:16", "John 3:16-18" or "John 3" into display-ready verses. */
function resolve(input,tr){
  tr=TRANSLATIONS.includes(tr)?tr:'kjv';
  const p=parseRef(input);if(!p)return null;
  const bk=booksList()[p.book],ch=bibleData(tr).books[p.book][p.chapter-1];
  if(!ch)return null;
  const label=bk.name+' '+p.chapter;let verses;
  if(p.verse==null){verses=ch.slice(0,MAX_VERSES).map((t,i)=>({n:i+1,text:t}))}
  else{const end=Math.min(p.verseEnd||p.verse,ch.length,p.verse+MAX_VERSES-1);verses=[];for(let i=p.verse;i<=end;i++)verses.push({n:i,text:ch[i-1]})}
  if(!verses.length||!verses[0].text)return null;
  const ref=verses.length===1&&p.verse!=null?`${label}:${p.verse}`:p.verse==null?label:`${label}:${verses[0].n}-${verses[verses.length-1].n}`;
  return{ref,label,book:p.book,chapter:p.chapter,verse:verses[0].n,verseEnd:verses[verses.length-1].n,verses,text:verses.map(v=>v.text).join(' '),translation:tr};
}
/* ---------- LAN discovery ---------- */
function lanAddresses(){
  const out=new Set();
  for(const list of Object.values(os.networkInterfaces()||{}))for(const i of list||[]){
    const v4=i.family==='IPv4'||i.family===4;
    if(i.internal||!v4||i.address.startsWith('169.254.'))continue;
    out.add(i.address);
  }
  return[...out];
}
/* Virtual adapters (Docker/Hyper-V/WSL) hand out 172.17–172.31 addresses that a phone
   can never reach, so rank real home/office LAN ranges first. */
function addressRank(ip){
  if(/^192\.168\./.test(ip))return 0;
  if(/^10\./.test(ip))return 1;
  if(/^172\.(1[6-9]|2\d|3[01])\./.test(ip))return 3;
  return 2;
}
function sortedAddresses(){return lanAddresses().sort((a,b)=>addressRank(a)-addressRank(b)||a.localeCompare(b))}
function baseUrl(){const a=sortedAddresses();return a.length?'http://'+a[0]+':'+PORT:'http://localhost:'+PORT}

/* ---------- Live service session (shared by display + phones) ---------- */
const session={code:null,pinHash:null,createdAt:0,listeners:new Set(),remoteCount:0};
const state={presentation:{ref:'',label:'',text:'',verses:[],translation:'kjv',theme:'royal',church:'',blank:true,ts:0},timer:null};

const hash=s=>crypto.createHash('sha256').update(String(s)).digest('hex').toUpperCase();
function newCode(){const A='ACDEFGHJKLMNPQRTUVWXY34679';let c='';const b=crypto.randomBytes(6);for(let i=0;i<6;i++)c+=A[b[i]%A.length];return c}
function codeValid(c){return session.code&&hash(c)===session.pinHash}

/* A code may be derived from a 4–6 char PIN or generated automatically. */
function startSession(pin){
  const p=String(pin||'').trim();
  session.code=/^[A-Z0-9]{4,6}$/.test(p.toUpperCase())?p.toUpperCase():newCode();
  session.pinHash=hash(session.code);
  session.createdAt=Date.now();
  session.remoteCount=0;
  broadcast('session',{code:session.code,createdAt:session.createdAt});
  return session.code;
}

/* The service code is a LAN-wide secret: it is what lets a phone drive the projector.
   Only code-authenticated routes may ever echo it back. */
function snapshot(includeCode){return{presentation:state.presentation,timer:state.timer,session:{code:includeCode?session.code:null,active:!!session.code,remoteCount:session.remoteCount,listeners:session.listeners.size},serverTime:Date.now()}}
function broadcast(type,payload){
  const frame='event: '+type+'\ndata: '+JSON.stringify(payload)+'\n\n';
  for(const res of session.listeners){try{res.write(frame)}catch{session.listeners.delete(res)}}
}

/* Apply one remote/display action to the shared state. */
function applyAction(a){
  if(!a||typeof a!=='object')return{ok:false,error:'Invalid action'};
  switch(a.type){
    case 'presentation':{
      const p=a.payload||{};
      /* book 0 is Genesis, so only chapter/verse are strictly 1-based */
      const pos=v=>(Number.isFinite(+v)&&+v>=1)?+v:null;
      const book=v=>(Number.isFinite(+v)&&+v>=0&&+v<booksList().length)?+v:null;
      state.presentation={
        ref:String(p.ref||'').slice(0,80),
        label:String(p.label||p.ref||'').slice(0,120),
        text:String(p.text||'').slice(0,4000),
        verses:Array.isArray(p.verses)?p.verses.slice(0,MAX_VERSES).map(v=>({n:v.n,text:String(v.text||'').slice(0,1000)})):[],
        /* position is kept so next/prev can walk the canon */
        book:book(p.book),chapter:pos(p.chapter),verse:pos(p.verse),verseEnd:pos(p.verseEnd),
        translation:TRANSLATIONS.includes(p.translation)?p.translation:'kjv',
        theme:THEMES.includes(p.theme)?p.theme:'royal',
        church:String(p.church||'').slice(0,80),
        blank:!!p.blank,
        ts:Date.now(),
      };
      broadcast('presentation',state.presentation);
      return{ok:true};
    }
    case 'timer':{
      state.timer=a.payload&&typeof a.payload==='object'?{...a.payload,ts:Date.now()}:null;
      broadcast('timer',state.timer);
      return{ok:true};
    }
    case 'blank':
      state.presentation={...state.presentation,blank:!!a.blank,ts:Date.now()};
      broadcast('presentation',state.presentation);
      return{ok:true};
    case 'next':case 'prev':{
      const cur=state.presentation;
      if(cur.book==null)return{ok:false,error:'Send a verse first'};
      const list=booksList();
      /* after a range, "next" continues from the END of the range */
      let bi=cur.book,ch=cur.chapter,v=(a.type==='next'?(cur.verseEnd||cur.verse||1):(cur.verse||1))+(a.type==='next'?1:-1);
      if(v<1){if(ch===1){if(bi===0)return{ok:false,error:'Start of Bible'};bi--;ch=list[bi].chapters}else ch--;v=bibleData(cur.translation).books[bi][ch-1].length}
      /* bk/chs must reflect the book we landed on after any boundary crossing above */
      const bk=list[bi],chs=bibleData(cur.translation).books[bi];
      if(v>chs[ch-1].length){if(ch>=bk.chapters){if(bi===list.length-1)return{ok:false,error:'End of Bible'};bi++;ch=1}else ch++;v=1}
      const r=resolve(list[bi].name+' '+ch+':'+v,cur.translation);
      if(!r)return{ok:false,error:'Cannot advance'};
      state.presentation={...cur,...r,blank:false,ts:Date.now()};
      broadcast('presentation',state.presentation);
      return{ok:true};
    }
    default:return{ok:false,error:'Unknown action'};
  }
}

/* ---------- Premium accounts, subscriptions, referrals and admin ---------
   Billing is deliberately server-side. The browser only receives the Paystack
   public key; the secret key, account store and admin actions never leave this
   process. Set the values in .env.example in the deployment environment. */
const PREMIUM_PLANS={
  silver:{id:'silver',name:'Silver',price:2500,period:'month',tagline:'A steady Scripture rhythm',benefits:['Full Bible reader and search','Reading plans, notes and bookmarks','100 AI study questions per month','30 Studio voice readings per month','Phone remote and presentation tools'],aiMonthly:100,ttsMonthly:30},
  gold:{id:'gold',name:'Gold',price:5000,period:'month',tagline:'For serious personal study',benefits:['Everything in Silver','500 AI study questions per month','100 Studio voice readings per month','Translation comparison and deeper study','Priority feature access'],aiMonthly:500,ttsMonthly:100},
  premium:{id:'premium',name:'Premium',price:10000,period:'month',tagline:'The complete ministry toolkit',benefits:['Everything in Gold','2,000 AI study questions per month','400 Studio voice readings per month','Voice Preacher Mode','Ministry presentation and remote'],aiMonthly:2000,ttsMonthly:400},
  unlimited:{id:'unlimited',name:'Unlimited',price:20000,period:'month',tagline:'For churches and heavy use',benefits:['Everything in Premium','10,000 AI questions per month (fair use)','2,000 Studio voice readings per month (fair use)','Multiple ministry operators','Priority support and early access'],aiMonthly:10000,ttsMonthly:2000},
};
const ANALYTICS_PAGES=Object.freeze(['home','bible','study','search','prayer','devotional','plans','ministry','profile','presentation']);
const ANALYTICS_PAGE_SET=new Set(ANALYTICS_PAGES);
const ANALYTICS_ALLOWED_ORIGINS=new Set(String(process.env.ANALYTICS_ALLOWED_ORIGINS||'https://kingdom-bible-wine.vercel.app')
  .split(',').map(value=>value.trim()).filter(Boolean).map(value=>{try{return new URL(value).origin}catch{return ''}}).filter(Boolean));
const ANALYTICS_ENABLED=!/^(off|0|false|no|disabled)$/i.test(String(process.env.ANALYTICS_ENABLED||'').trim());
const ANALYTICS_RETENTION_DAYS=400;
const PREMIUM_CONFIG={
  adminEmail:String(process.env.ADMIN_EMAIL||'stanley.okonkwo282@gmail.com').trim().toLowerCase(),
  adminPassword:String(process.env.ADMIN_PASSWORD||''),
  paystackPublicKey:String(process.env.PAYSTACK_PUBLIC_KEY||'').trim(),
  paystackSecretKey:String(process.env.PAYSTACK_SECRET_KEY||'').trim(),
  emailApiKey:String(process.env.EMAIL_API_KEY||process.env.EMAIL_KEY||'').trim(),
  emailFrom:String(process.env.EMAIL_FROM||'').trim(),
  emailApiUrl:String(process.env.EMAIL_API_URL||'https://api.resend.com/emails').trim(),
  aiApiKey:String(process.env.AI_API_KEY||''),
  aiApiUrl:String(process.env.AI_API_URL||'https://api.openai.com/v1/chat/completions'),
  aiModel:String(process.env.AI_MODEL||'gpt-4o-mini'),
  /* Studio voice (Gemini TTS). Key stays server-side; model + voice are env-pinned
     because Google renames TTS models (2.5-flash-preview-tts -> newer generations).
     TTS_* names are canonical; GEMINI_* aliases are honoured for compatibility.
     Empty key = feature off with a clean 503, same pattern as AI_API_KEY. */
  ttsApiKey:String(process.env.TTS_API_KEY||process.env.GEMINI_API_KEY||''),
  ttsModel:String(process.env.TTS_MODEL||process.env.GEMINI_TTS_MODEL||'gemini-2.5-flash-preview-tts'),
  ttsVoice:String(process.env.TTS_VOICE||process.env.GEMINI_TTS_VOICE||'Fenrir'),
  ttsCacheDir:process.env.TTS_CACHE_DIR||path.join(__dirname,'.data','tts-cache'),
  storePath:process.env.PREMIUM_STORE_PATH||path.join(__dirname,'.data','premium-store.json'),
  /* A web OAuth client ID is PUBLIC by design — Google documents it for browser use and
     it grants no access on its own. Verification happens server-side against Google's
     JWKS, so no client secret is required or accepted for this flow. */
  googleClientId:String(process.env.GOOGLE_CLIENT_ID||'224088224223-rq9dlhqqoqhjjmq2ave78akeopchcgab.apps.googleusercontent.com').trim(),
  /* Google's OAuth consent screen can be published as "Internal", which by design
     only serves ONE Workspace organisation. Every other account — including the
     owner's own @gmail.com — is then refused on Google's OWN page with
     "Error 403: org_internal", which this app cannot intercept or explain.
     Offering a button that always dead-ends is worse than offering none, so an
     operator can take it away and steer everyone to email + password, which
     always works. Set GOOGLE_SIGNIN=off (0/false/no also accepted). */
  googleSignInOn:!/^(off|0|false|no|disabled)$/i.test(String(process.env.GOOGLE_SIGNIN||'').trim()),
  /* LIVE ministry hub — the always-on Render cloud server.
     The static Vercel build has no phone remote / SSE / service-code hub,
     so Ministry Mode offers a one-tap "Open Live Ministry Hub" doorway to
     this URL. Browsers block cross-origin fetch, so this is a plain link
     (target _blank), never an API call. Changing the hub URL = change it
     here + .env + hub-probe fallback. */
  liveHubUrl:String(process.env.LIVE_HUB_URL||'https://kingdom-bible.onrender.com').trim().replace(/\/+$/,''),
};
const premiumSessions=new Map();
function blankPremiumStore(){return{users:[],transactions:[],withdrawals:[],audit:[],notifications:[],passwordResets:[],analytics:{daily:{}}}}
function loadPremiumStore(){
  try{
    const store=Object.assign(blankPremiumStore(),JSON.parse(fs.readFileSync(PREMIUM_CONFIG.storePath,'utf8')));
    if(!store.analytics||typeof store.analytics!=='object')store.analytics={daily:{}};
    if(!store.analytics.daily||typeof store.analytics.daily!=='object'||Array.isArray(store.analytics.daily))store.analytics.daily={};
    return store;
  }catch{return blankPremiumStore()}
}
let premiumStore=loadPremiumStore();
function savePremiumStore(){fs.mkdirSync(path.dirname(PREMIUM_CONFIG.storePath),{recursive:true});fs.writeFileSync(PREMIUM_CONFIG.storePath,JSON.stringify(premiumStore,null,2))}
function uid(prefix){return prefix+'_'+crypto.randomBytes(9).toString('hex')}
function referralCode(){return 'KB'+crypto.randomBytes(4).toString('hex').toUpperCase()}
function passwordHash(password){const salt=crypto.randomBytes(16).toString('hex');return salt+':'+crypto.scryptSync(String(password),salt,32).toString('hex')}
function passwordOk(password,stored){try{const [salt,hash]=String(stored).split(':');const got=crypto.scryptSync(String(password),salt,32);return crypto.timingSafeEqual(got,Buffer.from(hash,'hex'))}catch{return false}}
function parseCookies(req){return Object.fromEntries(String(req.headers.cookie||'').split(';').map(x=>x.trim().split('=').map(decodeURIComponent)).filter(x=>x.length===2))}
function setSession(req,res,session,opts={}){
  /* A session cookie dies with the browser. "Keep me signed in" promotes it to a
     30-day Max-Age cookie so a restart on the ministry laptop does not force a
     re-login mid-service. The token itself is already 256 bits of randomness and
     stays HttpOnly, so a longer life does not widen what a script can read. */
  const secure=String(req.headers?.['x-forwarded-proto']||'').toLowerCase()==='https'||!!req.socket.encrypted;
  const maxAge=opts.remember===false?'':`; Max-Age=${30*86400}`;
  res.setHeader('Set-Cookie',`kb_session=${encodeURIComponent(session)}; HttpOnly; SameSite=Lax; Path=/${maxAge}${secure?'; Secure':''}`);
}
function clearSession(res){res.setHeader('Set-Cookie','kb_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0')}
function auth(req){const token=parseCookies(req).kb_session;return token?premiumSessions.get(token)||null:null}
/* ---------- Google Identity Services (ID token) verification ----------
   Dependency-free: Node imports a JWK directly, so we fetch Google's signing certs
   and verify the RS256 signature ourselves. The browser is never trusted for the
   email, and no client secret exists for this flow. Certs are cached for an hour;
   Google rotates them rarely, and an unknown `kid` forces a refetch. */
const GOOGLE_CERTS_URL='https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS=['accounts.google.com','https://accounts.google.com'];
let googleCerts={at:0,keys:{}};
/* A malformed or truncated credential makes JSON.parse throw a raw SyntaxError
   ("Unexpected token...") which the route below hands straight to the browser.
   A user whose Google sign-in hiccupped must never be shown a Node internal, so
   every decode failure becomes the same plain-language message. */
const decodeSegment=s=>{try{return JSON.parse(Buffer.from(s,'base64url').toString('utf8'))}catch{throw Error('Google sign-in was not completed')}};
async function googleSigningKeys(){if(Date.now()-googleCerts.at<3600000&&Object.keys(googleCerts.keys).length)return googleCerts.keys;const r=await fetch(GOOGLE_CERTS_URL);if(!r.ok)throw Error('Google sign-in cannot be verified right now');const j=await r.json();const keys={};for(const k of j.keys||[])keys[k.kid]=k;googleCerts={at:Date.now(),keys};return keys}
async function verifyGoogleCredential(credential){
  if(typeof credential!=='string'||credential.split('.').length!==3)throw Error('Google sign-in was not completed');
  const[header,claims,signature]=credential.split('.');const head=decodeSegment(header),pay=decodeSegment(claims);
  if(head.alg!=='RS256')throw Error('Unexpected Google token format');
  const jwk=(await googleSigningKeys())[head.kid];
  if(!jwk){googleCerts={at:0,keys:{}};throw Error('Google signing key not recognised — please try again')}
  /* An unexpected JWK shape would make createPublicKey throw a raw OpenSSL error,
     which the route returns verbatim. Same rule as decodeSegment: plain language. */
  let sigOk=false;
  try{sigOk=crypto.verify('RSA-SHA256',Buffer.from(header+'.'+claims),crypto.createPublicKey({key:jwk,format:'jwk'}),Buffer.from(signature,'base64url'))}catch{}
  if(!sigOk)throw Error('Google sign-in could not be verified');
  const now=Math.floor(Date.now()/1000);
  if(!pay.exp||pay.exp<now-60)throw Error('Google sign-in has expired — please try again');
  if(pay.iat&&pay.iat>now+60)throw Error('Google sign-in is not valid yet');
  if(pay.aud!==PREMIUM_CONFIG.googleClientId)throw Error('Google sign-in was issued for a different app');
  if(!GOOGLE_ISSUERS.includes(pay.iss))throw Error('Google sign-in came from an unexpected source');
  if(!pay.email||pay.email_verified!==true)throw Error('Google did not share a verified email address');
  return{sub:String(pay.sub||''),email:String(pay.email).toLowerCase(),name:String(pay.name||pay.email.split('@')[0]).slice(0,80),picture:String(pay.picture||'')};
}
function audit(event,actor,details={}){premiumStore.audit.unshift({id:uid('audit'),event,actor:actor||'system',details,date:new Date().toISOString()});premiumStore.audit=premiumStore.audit.slice(0,1000);savePremiumStore()}
function notifyAdmin(type,message,details={}){premiumStore.notifications.unshift({id:uid('note'),type,message,details,read:false,date:new Date().toISOString()});premiumStore.notifications=premiumStore.notifications.slice(0,200);savePremiumStore()}
function publicUser(u){
  if(!u)return null;
  const entitlement=entitlementOf(u),subscription=u.subscription;
  const permanentGrant=subscription?.status==='active'&&Number(subscription.expiresAt)>=Number.MAX_SAFE_INTEGER;
  const paidSubscription=subscription?.status==='active'&&subscription.expiresAt>Date.now()&&!subscription.adminGranted;
  return{id:u.id,email:u.email,name:u.name,avatar:u.avatar||'',role:u.role||'user',referralCode:u.referralCode,trialEndsAt:u.trialEndsAt,
    plan:entitlement.plan,status:entitlement.status,daysRemaining:entitlement.daysRemaining,
    adminGranted:!!subscription?.adminGranted,paidSubscription:!!paidSubscription,entitlementExpiresAt:subscription?.status==='active'&&!permanentGrant?subscription.expiresAt:null,
    walletBalance:u.wallet?.balance||0,authProvider:u.authProvider||'password',createdAt:u.createdAt};
}
function entitlementOf(u){
  if(!u)return{plan:'none',status:'signed_out',daysRemaining:0};
  if(u.role==='admin')return{plan:'unlimited',status:'admin',daysRemaining:null};
  const now=Date.now();
  if(u.subscription?.status==='active'&&u.subscription.expiresAt>now){
    const permanent=Number(u.subscription.expiresAt)>=Number.MAX_SAFE_INTEGER;
    return{plan:u.subscription.plan,status:'active',daysRemaining:permanent?null:Math.ceil((u.subscription.expiresAt-now)/86400000)};
  }
  if(u.trialEndsAt>now)return{plan:'trial',status:'trial',daysRemaining:Math.ceil((u.trialEndsAt-now)/86400000)};
  return{plan:'expired',status:'expired',daysRemaining:0};
}
function findUser(id){return premiumStore.users.find(u=>u.id===id)}
/* Removing or resetting an account must also end its live sessions. Otherwise the
   person keeps browsing on a token whose user no longer exists, and a "reset"
   silently leaves the old session signed in — which looks exactly like nothing
   happened. Returns how many tokens were killed so the caller can report it. */
function dropSessionsFor(userId){let n=0;for(const [token,s]of premiumSessions)if(s.userId===userId){premiumSessions.delete(token);n++}return n}
function sessionRecord(req){const a=auth(req);if(!a)return null;if(a.role==='admin')return{...a,user:null};const user=findUser(a.userId);return user?{...a,user}:null}
function requireAuth(req,res){const s=sessionRecord(req);if(!s){json(res,401,{ok:false,error:'Please sign in'});return null}return s}
function requireAdmin(req,res){const g=adminGate(req);if(!g.ok){denyAdmin(res,g);return null}const s=sessionRecord(req);if(!s||s.role!=='admin'){json(res,403,{ok:false,error:'Administrator access required'});return null}return s}
/* ---------- admin gate ------------
  /admin is protected by session-based authentication only.
  An admin session is created via POST /api/auth/login with admin credentials
  (PREMIUM_CONFIG.adminEmail / PREMIUM_CONFIG.adminPassword). No Tailscale,
  no tunnel, no IP allowlist — the same credentials work from localhost,
  Render, or any host that can reach this server. */
function adminGate(req){
  const s=sessionRecord(req);
  if(!s)return{ok:false,why:'Please sign in'};
  if(s.role!=='admin')return{ok:false,why:'Administrator access required'};
  return{ok:true,how:'session'};
}

function denyAdmin(res,g){return json(res,403,{ok:false,error:g.why||'Administrator portal unavailable'})}
/* minimal HTML escape for the server-rendered block page; `esc` only exists in the
   browser bundles, so referencing it here threw a ReferenceError (HTTP 500). */
const escHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function addWallet(u,amount,type,description,meta={}){u.wallet=u.wallet||{balance:0,ledger:[]};u.wallet.balance+=amount;u.wallet.ledger.unshift({id:uid('ledger'),amount,type,description,date:new Date().toISOString(),meta});u.wallet.ledger=u.wallet.ledger.slice(0,300)}
/* Referral performance for the wallet screen. `earned` is only what actually landed in
   the wallet — pending payouts are listed separately so a user is never told they
   "have" money that an administrator has not yet released. */
function referralStats(u){
  const invited=premiumStore.users.filter(x=>x.referredBy===u.referralCode);
  const paid=invited.filter(x=>x.subscription?.status==='active').length;
  const pending=premiumStore.withdrawals.filter(w=>w.userId===u.id&&w.status==='pending');
  const paidOut=premiumStore.withdrawals.filter(w=>w.userId===u.id&&w.status==='paid');
  const pendingNaira=pending.reduce((s,w)=>s+w.amount,0),paidNaira=paidOut.reduce((s,w)=>s+w.amount,0);
  const balance=u.wallet?.balance||0;
  return{code:u.referralCode,link:'/?ref='+encodeURIComponent(u.referralCode),invited:invited.length,converted:paid,balance,pendingNaira,paidNaira,totalEarned:balance+pendingNaira+paidNaira,minWithdrawal:1000,canWithdraw:balance>=1000,shortfall:Math.max(0,1000-balance)};
}
/* One authenticated, allow-listed snapshot for the admin portal. Sensitive payout
   account numbers are masked here and returned only by the separately audited
   details endpoint. Provider payloads, keys, and password-reset hashes never leave
   the server. Summary totals are computed from the complete store, even where the
   portal intentionally shows only the most recent rows. */
function analyticsDailyStore(){
  if(!premiumStore.analytics||typeof premiumStore.analytics!=='object')premiumStore.analytics={daily:{}};
  if(!premiumStore.analytics.daily||typeof premiumStore.analytics.daily!=='object'||Array.isArray(premiumStore.analytics.daily))premiumStore.analytics.daily={};
  return premiumStore.analytics.daily;
}
function safeAnalyticsCount(value){
  const count=Number(value);
  return Number.isSafeInteger(count)&&count>=0?count:0;
}
function recordPublicPageView(page,visitStart){
  const now=Date.now(),today=new Date(now).toISOString().slice(0,10),daily=analyticsDailyStore();
  const existing=daily[today],row=existing&&typeof existing==='object'&&!Array.isArray(existing)?existing:(daily[today]={views:0,visits:0,pages:{}});
  if(!row.pages||typeof row.pages!=='object'||Array.isArray(row.pages))row.pages={};
  row.views=Math.min(Number.MAX_SAFE_INTEGER,safeAnalyticsCount(row.views)+1);
  row.visits=Math.min(Number.MAX_SAFE_INTEGER,safeAnalyticsCount(row.visits)+(visitStart?1:0));
  row.pages[page]=Math.min(Number.MAX_SAFE_INTEGER,safeAnalyticsCount(row.pages[page])+1);
  const cutoff=new Date(now-(ANALYTICS_RETENTION_DAYS-1)*86400000).toISOString().slice(0,10);
  for(const date of Object.keys(daily))if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date<cutoff||date>today)delete daily[date];
  savePremiumStore();
}
function visitorAnalyticsData(days=30,now=Date.now()){
  const dailyStore=analyticsDailyStore(),daily=[],pageTotals=new Map(ANALYTICS_PAGES.map(page=>[page,0]));
  let totalViews=0,totalVisits=0;
  for(let offset=days-1;offset>=0;offset--){
    const date=new Date(now-offset*86400000).toISOString().slice(0,10),stored=dailyStore[date]||{},storedPages=stored.pages&&typeof stored.pages==='object'?stored.pages:{};
    const views=safeAnalyticsCount(stored.views),visits=safeAnalyticsCount(stored.visits),pages={};
    for(const page of ANALYTICS_PAGES){pages[page]=safeAnalyticsCount(storedPages[page]);pageTotals.set(page,pageTotals.get(page)+pages[page]);}
    totalViews+=views;totalVisits+=visits;daily.push({date,views,visits,pages});
  }
  return{
    rangeDays:days,from:daily[0]?.date||null,through:daily[daily.length-1]?.date||null,
    totalViews,totalVisits,daily,
    pages:ANALYTICS_PAGES.map(page=>({page,views:pageTotals.get(page)})).sort((a,b)=>b.views-a.views||a.page.localeCompare(b.page))
  };
}
function adminOverviewData(){
  const storedUsers=premiumStore.users||[];
  /* Do not send account photos, password hashes, Google subject IDs, provider
     payloads, or complete bank numbers to a dashboard that only needs metadata. */
  const users=storedUsers.map(u=>{
    const{avatar,...safe}=publicUser(u);
    return{...safe,hasPassword:!!u.passwordSet,hasGoogle:!!u.googleSub};
  });
  const byId=new Map(users.map(u=>[u.id,u]));
  const storedTransactions=premiumStore.transactions||[],storedWithdrawals=premiumStore.withdrawals||[];
  const recentTransactions=storedTransactions.slice(-250),recentWithdrawals=storedWithdrawals.slice(-200);
  const recentTransactionSet=new Set(recentTransactions),recentWithdrawalSet=new Set(recentWithdrawals);
  /* Never bury an outstanding item behind a recent-history cap. Totals cover the
     full store; the portal also receives every pending payment/payout plus recent
     settled history so a stale queue remains actionable. */
  const transactionRows=storedTransactions.filter(x=>x.status==='pending'&&!recentTransactionSet.has(x)).concat(recentTransactions).reverse();
  const withdrawalRows=storedWithdrawals.filter(x=>x.status==='pending'&&!recentWithdrawalSet.has(x)).concat(recentWithdrawals).reverse();
  const amountOf=x=>Math.max(0,Number(x?.amount)||0);
  const successful=storedTransactions.filter(x=>x.status==='success');
  const pendingPayments=storedTransactions.filter(x=>x.status==='pending');
  const failedPayments=storedTransactions.filter(x=>x.status==='failed');
  const abandonedPayments=storedTransactions.filter(x=>x.status==='abandoned');
  const pendingWithdrawals=storedWithdrawals.filter(x=>x.status==='pending');
  const paidWithdrawals=storedWithdrawals.filter(x=>x.status==='paid');
  const active=users.filter(u=>u.status==='active');
  const referralUsers=new Map();
  for(const u of storedUsers){if(u.referredBy){const a=referralUsers.get(u.referredBy)||[];a.push(u);referralUsers.set(u.referredBy,a)}}
  const referrals=storedUsers.filter(u=>u.referralCode).map(u=>{
    const invited=referralUsers.get(u.referralCode)||[],ledger=u.wallet?.ledger||[];
    const reward=type=>ledger.filter(x=>x.type===type).reduce((sum,x)=>sum+Math.max(0,Number(x.amount)||0),0);
    const signupRewardsNaira=reward('signup'),commissionNaira=reward('commission');
    return{userId:u.id,email:u.email,name:u.name||'',referralCode:u.referralCode,signups:invited.length,
      paidReferrals:invited.filter(x=>byId.get(x.id)?.status==='active').length,
      signupRewardsNaira,commissionNaira,earnedNaira:signupRewardsNaira+commissionNaira,
      walletBalance:Math.max(0,Number(u.wallet?.balance)||0)};
  }).filter(x=>x.signups||x.earnedNaira||x.walletBalance).sort((a,b)=>b.signups-a.signups||b.earnedNaira-a.earnedNaira);
  const storedNotifications=premiumStore.notifications||[];
  const notifications=storedNotifications.slice(0,50).map(n=>({
    id:n.id,type:String(n.type||'notice'),message:String(n.message||''),read:!!n.read,date:n.date||null
  }));
  const unreadNotifications=storedNotifications.filter(x=>!x.read).length;
  const nairaTotal=rows=>rows.reduce((sum,x)=>sum+amountOf(x),0);
  return{
    ok:true,
    summary:{
      usersTotal:users.length,activeSubscribers:active.length,trials:users.filter(u=>u.status==='trial').length,
      expired:users.filter(u=>u.status==='expired').length,
      expiringSoon:active.filter(u=>u.daysRemaining!=null&&u.daysRemaining<=7).length,
      totalPayments:storedTransactions.length,successfulPayments:successful.length,pendingPayments:pendingPayments.length,
      failedPayments:failedPayments.length,abandonedPayments:abandonedPayments.length,
      successfulPlanValueNaira:nairaTotal(successful),pendingPlanValueNaira:nairaTotal(pendingPayments),
      referralSignups:storedUsers.filter(u=>!!u.referredBy).length,
      referralSignupBonusNaira:referrals.reduce((sum,x)=>sum+x.signupRewardsNaira,0),
      referralCommissionNaira:referrals.reduce((sum,x)=>sum+x.commissionNaira,0),
      pendingWithdrawals:pendingWithdrawals.length,pendingWithdrawalNaira:nairaTotal(pendingWithdrawals),
      paidWithdrawals:paidWithdrawals.length,paidWithdrawalNaira:nairaTotal(paidWithdrawals),unreadNotifications
    },
    notifications,
    withdrawals:withdrawalRows.map(w=>({
      id:w.id,userId:w.userId,amount:amountOf(w),accountName:w.accountName||'',
      accountNumberLast4:String(w.accountNumber||'').slice(-4),
      status:w.status||'pending',requestedAt:w.requestedAt||null,expectedBy:w.expectedBy||null,
      paidAt:w.paidAt||null,paidBy:w.paidBy||''
    })),
    transactions:transactionRows.map(t=>({
      id:t.id,reference:String(t.reference||''),userId:String(t.userId||''),email:byId.get(t.userId)?.email||'',
      plan:String(t.plan||''),amount:amountOf(t),status:String(t.status||'unknown'),
      createdAt:t.createdAt||null,paidAt:t.paidAt||null,failedAt:t.failedAt||null
    })),
    referrals,
    users,audit:(premiumStore.audit||[]).slice(0,150),
    analytics:visitorAnalyticsData(30),
    plans:Object.values(PREMIUM_PLANS).map(({aiMonthly,...x})=>x),
    passwordResets:(premiumStore.passwordResets||[]).filter(r=>!r.usedAt&&r.expiresAt>Date.now()).map(r=>({id:r.id,email:r.email,userId:r.userId,createdAt:r.createdAt,expiresAt:new Date(r.expiresAt).toISOString()}))
  };
}
/* Password recovery without an email provider. The user proves ownership by asking for
   a code; an administrator issues the short-lived code from the portal and passes it
   to them (WhatsApp, phone, in person). The code is hashed at rest and single-use, so
   reading the store file does not hand an attacker anybody's password reset. */
function issueCode(u){
  if(!premiumStore.passwordResets)premiumStore.passwordResets=[];
  /* Only one live code is valid per account; a resend invalidates every prior code. */
  premiumStore.passwordResets=premiumStore.passwordResets.filter(r=>r.userId!==u.id);
  const code=String(crypto.randomInt(100000,1000000));
  const r={id:uid('rst'),userId:u.id,email:u.email,codeHash:passwordHash(code),createdAt:new Date().toISOString(),expiresAt:Date.now()+30*60*1000,attempts:0,usedAt:null};
  premiumStore.passwordResets.unshift(r);
  premiumStore.passwordResets=premiumStore.passwordResets.slice(0,200);
  savePremiumStore();
  return{reset:r,code};
}
function startUser(email,name,password,referredBy){const now=Date.now(),u={id:uid('usr'),email,name:name||email.split('@')[0],passwordHash:passwordHash(password),passwordSet:!!password,role:'user',referralCode:referralCode(),referredBy:referredBy||'',referralRewarded:false,trialStartedAt:now,trialEndsAt:now+30*86400000,subscription:null,wallet:{balance:0,ledger:[]},ai:{month:'',used:0},createdAt:new Date(now).toISOString()};premiumStore.users.push(u);return u}
function planBy(id){return PREMIUM_PLANS[String(id||'').toLowerCase()]||null}
const GRANT_DURATION_LIMITS={days:36500,months:1200,years:100};
function addGrantDuration(startedAt,amount,unit){
  const date=new Date(startedAt);
  if(unit==='days')date.setUTCDate(date.getUTCDate()+amount);
  else if(unit==='months'||unit==='years'){
    const day=date.getUTCDate();date.setUTCDate(1);
    if(unit==='months')date.setUTCMonth(date.getUTCMonth()+amount);
    else date.setUTCFullYear(date.getUTCFullYear()+amount);
    const lastDay=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();
    date.setUTCDate(Math.min(day,lastDay));
  }
  return date.getTime();
}
function grantDuration(body){
  let amount,unit,legacy=false;
  if(Object.hasOwn(body,'durationAmount')||Object.hasOwn(body,'durationUnit')){
    amount=body.durationAmount;unit=body.durationUnit;
  }else if(Object.hasOwn(body,'freeMonths')){
    amount=body.freeMonths;unit='months';legacy=true;
  }else throw Object.assign(Error('Choose a duration or permanent access'),{statusCode:400});
  const knownUnit=typeof unit==='string'&&Object.hasOwn(GRANT_DURATION_LIMITS,unit);
  const limit=legacy?12:(knownUnit?GRANT_DURATION_LIMITS[unit]:0);
  if(!limit||typeof amount!=='number'||!Number.isSafeInteger(amount)||amount<1||amount>limit)
    throw Object.assign(Error('Duration must be a whole number from 1 to '+(limit||'the allowed maximum')+' '+(unit||'days')),{statusCode:400});
  return{amount,unit};
}
function currentPlanFor(u){const e=entitlementOf(u);return e.plan==='trial'?null:planBy(e.plan)}
function businessDaysFrom(date,n){const d=new Date(date);let left=n;while(left){d.setDate(d.getDate()+1);if(![0,6].includes(d.getDay()))left--}return d.toISOString()}
function monthKey(){const d=new Date();return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0')}
function aiAllowance(u){const e=entitlementOf(u);if(e.status==='admin')return 100000;if(e.status==='expired')return 0;if(e.status==='trial')return 25;return currentPlanFor(u)?.aiMonthly||0}
function paystackCredentials(){
  const publicKey=PREMIUM_CONFIG.paystackPublicKey,secretKey=PREMIUM_CONFIG.paystackSecretKey;
  const publicMode=(publicKey.match(/^pk_(test|live)_/)||[])[1]||'';
  const secretMode=(secretKey.match(/^sk_(test|live)_/)||[])[1]||'';
  const usable=(key,prefix)=>new RegExp('^'+prefix+'_(test|live)_[A-Za-z0-9_-]{8,}$').test(key)&&!/(replace|placeholder|example|your_key)/i.test(key);
  const publicValid=usable(publicKey,'pk'),secretValid=usable(secretKey,'sk');
  const testModeAllowed=String(process.env.PAYSTACK_ALLOW_TEST_MODE||'').toLowerCase()==='true';
  const modeAllowed=publicMode==='live'||testModeAllowed;
  const ready=publicValid&&secretValid&&publicMode===secretMode&&modeAllowed;
  const reason=!publicKey||!secretKey?'Paystack checkout needs both a public key and a server-side secret key':publicMode&&secretMode&&publicMode!==secretMode?'Paystack public and secret keys must use the same test/live mode':publicMode==='test'&&!testModeAllowed?'Paystack test mode is disabled; enable it only in a non-live test environment':'Paystack keys are missing, invalid, or still placeholders';
  return{ready,mode:ready?publicMode:'unavailable',reason};
}
function loopbackTestUrl(url){return process.env.NODE_ENV==='test'&&['127.0.0.1','localhost','::1'].includes(url.hostname)}
function secureProviderUrl(value){try{const url=new URL(value);return url.protocol==='https:'||loopbackTestUrl(url)}catch{return false}}
function passwordResetEmailEnabled(){return!!(PREMIUM_CONFIG.emailApiKey&&PREMIUM_CONFIG.emailFrom&&secureProviderUrl(PREMIUM_CONFIG.emailApiUrl))}
async function paystack(pathname,options={}){
  if(!paystackCredentials().ready)throw new Error(paystackCredentials().reason);
  const base=String(process.env.PAYSTACK_API_URL||'https://api.paystack.co').replace(/\/+$/,'');
  const url=new URL(pathname,base);
  if(url.protocol!=='https:'&&!loopbackTestUrl(url))throw new Error('Paystack endpoint must use HTTPS');
  const r=await fetch(url,{...options,headers:{Authorization:'Bearer '+PREMIUM_CONFIG.paystackSecretKey,'Content-Type':'application/json',...(options.headers||{})},signal:AbortSignal.timeout(15000)});
  const d=await r.json().catch(()=>({}));if(!r.ok||d.status===false)throw new Error(d.message||'Paystack request failed');return d;
}
function validPaystackTransaction(tx,data){
  if(!tx||!data||data.status!=='success'||String(data.reference||'')!==String(tx.reference))return false;
  const amount=Number(data.amount),metadata=data.metadata||{};
  return Number.isFinite(amount)&&amount>=Number(tx.amount)*100&&String(data.currency||'').toUpperCase()==='NGN'
    &&String(metadata.userId||'')===String(tx.userId)&&String(metadata.plan||'').toLowerCase()===String(tx.plan).toLowerCase();
}
function validPaystackSignature(raw,signature){
  if(!PREMIUM_CONFIG.paystackSecretKey||typeof signature!=='string'||! /^[a-f0-9]{128}$/i.test(signature))return false;
  const expected=crypto.createHmac('sha512',PREMIUM_CONFIG.paystackSecretKey).update(raw).digest();
  const supplied=Buffer.from(signature,'hex');
  return supplied.length===expected.length&&crypto.timingSafeEqual(expected,supplied);
}
async function sendPasswordResetEmail(email,code){
  if(!passwordResetEmailEnabled())throw new Error('Password reset email is not configured');
  let url;try{url=new URL(PREMIUM_CONFIG.emailApiUrl)}catch{throw new Error('Email provider URL is invalid')}
  if(!secureProviderUrl(url.href))throw new Error('Email provider endpoint must use HTTPS');
  const textBody=`Your KINGDOM BIBLE password reset code is ${code}.\n\nEnter it in the password reset form within 30 minutes. If you did not request this, you can ignore this email.`;
  const html=`<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#13213a"><p style="font-weight:bold;letter-spacing:.08em">KINGDOM BIBLE</p><h1 style="font-size:24px">Reset your password</h1><p>Use this one-time code to choose a new password:</p><p style="font-size:32px;font-weight:bold;letter-spacing:.25em;color:#9a7411">${code}</p><p>The code expires in 30 minutes and works once. If you did not request this, ignore this message.</p></div>`;
  const r=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+PREMIUM_CONFIG.emailApiKey,'Content-Type':'application/json'},body:JSON.stringify({from:PREMIUM_CONFIG.emailFrom,to:[email],subject:'Your KINGDOM BIBLE password reset code',text:textBody,html}),signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw new Error('Email provider returned HTTP '+r.status);
  return true;
}
/* AI providers on a free tier return 429/503 whenever demand spikes. Measured in
   production use: the very same request succeeded seconds after a 503, so a single
   short retry clears almost every capacity blip instead of charging the user a
   failed question. A 401 (bad key) is never retried — that is a real fault and the
   operator needs to see it immediately. */
const AI_SYSTEM='You are a careful Bible study assistant for KINGDOM BIBLE. Answer with humility, distinguish Scripture from interpretation, cite references when possible, encourage reading context, and never claim divine authority. Do not provide medical, legal, financial, or emergency instructions as a substitute for professionals.';
async function askAi(question){
  const body=JSON.stringify({model:PREMIUM_CONFIG.aiModel,messages:[{role:'system',content:AI_SYSTEM},{role:'user',content:question}],temperature:.35,max_tokens:900});
  let status=0,why='';
  for(let attempt=0;attempt<2;attempt++){
    if(attempt)await new Promise(s=>setTimeout(s,900));
    const r=await fetch(PREMIUM_CONFIG.aiApiUrl,{method:'POST',headers:{Authorization:'Bearer '+PREMIUM_CONFIG.aiApiKey,'Content-Type':'application/json'},body});
    const d=await r.json().catch(()=>({}));
    if(r.ok){const answer=d.choices?.[0]?.message?.content;if(answer)return answer;why='the provider returned an empty answer';status=r.status;continue}
    status=r.status;why=d.error?.message||d.message||`empty body (${r.statusText||'no status text'})`;
    if(status!==429&&status!==503)break;
  }
  throw new Error(`AI provider unavailable (HTTP ${status}): ${String(why).slice(0,180)}`);
}
/* ---------- Studio voice (Gemini TTS, dependency-free) ----------
   Device speechSynthesis stays the offline default; this is the online upgrade.
   Gemini TTS answers with raw PCM (16-bit mono, 24 kHz). An <audio> element
   cannot play that — it must be wrapped in a WAV header first (see pcmToWav).
   Billing is per character, so: auth + monthly allowance (tighter than AI text),
   verse-group chunking (long chapters are many requests), disk cache keyed on
   text+voice+model (survives restarts), 402 accounting even on cache hits would
   let cached reads bypass quota — instead cached reads are free but the request
   still requires a signed-in account, so anonymous scraping cannot farm audio. */
const TTS_SAMPLE_RATE=24000,TTS_MAX_CHARS=900,TTS_BODY_LIMIT=8192;
function ttsAllowance(u){const e=entitlementOf(u);if(e.status==='admin')return 100000;if(e.status==='expired')return 0;if(e.status==='trial')return 20;const p=currentPlanFor(u);if(!p)return 0;return{silver:60,gold:200,premium:600,unlimited:2000}[p.id]||0}
function ttsDir(){return process.env.PREMIUM_STORE_PATH?path.join(path.dirname(PREMIUM_CONFIG.storePath),'tts-cache'):PREMIUM_CONFIG.ttsCacheDir}
function ttsPathFor(text){return path.join(ttsDir(),crypto.createHash('sha256').update(PREMIUM_CONFIG.ttsModel+'|'+PREMIUM_CONFIG.ttsVoice+'|'+text).digest('hex')+'.wav')}
function chunkForTts(text){const parts=String(text||'').split(/(?<=[.!?])\s+/).map(s=>s.trim()).filter(Boolean);const out=[];let cur='';for(const s of parts){if((cur+' '+s).trim().length>TTS_MAX_CHARS){if(cur)out.push(cur);cur=s}else cur=(cur+' '+s).trim()}if(cur)out.push(cur);return out.slice(0,12)}
function pcmToWav(pcm){const n=pcm.length,head=Buffer.alloc(44);head.write('RIFF',0);head.writeUInt32LE(36+n,4);head.write('WAVE',8);head.write('fmt ',12);head.writeUInt32LE(16,16);head.writeUInt16LE(1,20);head.writeUInt16LE(1,22);head.writeUInt32LE(TTS_SAMPLE_RATE,24);head.writeUInt32LE(TTS_SAMPLE_RATE*2,28);head.writeUInt16LE(2,32);head.writeUInt16LE(16,34);head.write('data',36);head.writeUInt32LE(n,40);return Buffer.concat([head,pcm])}
/* Gemini TTS is a billed call, so the test suite must never reach it: when the
   key is exactly TEST_KEY the route serves wrapped silence instead. Any other
   value (including empty) follows the production path and its guards. */
async function geminiTts(text){
  if(PREMIUM_CONFIG.ttsApiKey==='TEST_KEY')return pcmToWav(Buffer.alloc(TTS_SAMPLE_RATE*2));
  const url='https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(PREMIUM_CONFIG.ttsModel)+':generateContent?key='+encodeURIComponent(PREMIUM_CONFIG.ttsApiKey);
  const payload=JSON.stringify({contents:[{parts:[{text:'Read aloud clearly and naturally, at a calm measured pace: '+text}]}],generationConfig:{responseModalities:['AUDIO'],speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName:PREMIUM_CONFIG.ttsVoice}}}}});
  let status=0,why='';
  for(let attempt=0;attempt<2;attempt++){
    if(attempt)await new Promise(s=>setTimeout(s,900));
    let r;try{r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:payload})}catch(e){why='network: '+(e.message||e);continue}
    const d=await r.json().catch(()=>({}));status=r.status;
    const b64=d.candidates?.[0]?.content?.parts?.find(p=>p.inlineData?.data)?.inlineData?.data;
    if(r.ok&&b64)return pcmToWav(Buffer.from(b64,'base64'));
    why=d.error?.message||`empty body (${r.statusText||'no status text'})`;
    if(status!==429&&status!==503)break;
  }
  throw new Error(`Studio voice unavailable (HTTP ${status}): ${String(why).slice(0,180)}`);
}
async function settlePayment(reference,verified){
  const tx=premiumStore.transactions.find(x=>x.reference===reference);if(!tx||tx.status==='success')return tx;
  if(!verified)return tx;
  const u=findUser(tx.userId);if(!u)return tx;
  tx.status='success';tx.paidAt=new Date().toISOString();u.subscription={status:'active',plan:tx.plan,price:tx.amount,startedAt:Date.now(),expiresAt:Date.now()+31*86400000,reference};
  if(u.referredBy&&!u.referralRewarded){const ref=premiumStore.users.find(x=>x.referralCode===u.referredBy&&x.id!==u.id);if(ref){addWallet(ref,Math.round(tx.amount*.1),'commission','10% first-payment referral commission',{fromUser:u.id,reference});u.referralRewarded=true;}}
  savePremiumStore();audit('payment.success',u.id,{reference,plan:tx.plan,amount:tx.amount});return tx;
}
function premiumPublic(){const payment=paystackCredentials();return{plans:Object.values(PREMIUM_PLANS).map(({aiMonthly,...p})=>p),trialDays:30,trialWarningDays:7,referral:{signupNaira:100,firstPaymentPercent:10,pointValueNaira:1,minWithdrawal:1000,payoutSlaWorkingDays:3},paystackPublicKey:payment.ready?PREMIUM_CONFIG.paystackPublicKey:'',paystackReady:payment.ready,paystackMode:payment.mode,passwordResetEmailEnabled:passwordResetEmailEnabled(),googleClientId:PREMIUM_CONFIG.googleClientId,googleSignInEnabled:PREMIUM_CONFIG.googleSignInOn&&!!PREMIUM_CONFIG.googleClientId,appVersion:VERSION,liveHubUrl:PREMIUM_CONFIG.liveHubUrl,whatsapp:SUPPORT_PHONE,whatsappDisplay:SUPPORT_PHONE_DISPLAY,whatsappLink:supportLink()}}

/* ---------- HTTP server ---------- */
const server=http.createServer(async(req,res)=>{
  const u=new URL(req.url,'http://x'),p=u.pathname;
  try{
    if(!rate(req,res))return;
    /* Public health probe: no secrets, no stack traces. Consumed by /status and by
       uptime checks. `presentation` reports whether the live hub is reachable. */
    if(p==='/health')return json(res,200,{ok:true,app:APP,version:VERSION,presentation:'operational',sessionActive:!!session.code,listeners:session.listeners.size,uptime:Math.round(process.uptime()),serverTime:Date.now()});
    /* Discovery must never hand the pairing code to anyone on the LAN who asks. */
    if(p==='/api/network')return json(res,200,{ok:true,port:PORT,addresses:sortedAddresses(),url:baseUrl(),sessionActive:!!session.code,listeners:session.listeners.size});
    if(p==='/api/analytics/pageview'){
      const originAllowed=publicAnalyticsCors(req,res);
      if(req.method==='OPTIONS'){
        if(!originAllowed)return json(res,403,{ok:false,error:'Origin not allowed'});
        res.setHeader('Content-Length','0');res.statusCode=204;return res.end();
      }
      if(!originAllowed)return json(res,403,{ok:false,error:'Origin not allowed'});
      if(req.method!=='POST'){res.setHeader('Allow','POST, OPTIONS');return json(res,405,{ok:false,error:'Method not allowed'});}
      if(!ANALYTICS_ENABLED){res.setHeader('Cache-Control','no-store');res.statusCode=204;return res.end();}
      const contentType=String(req.headers['content-type']||'').toLowerCase();
      if(!/^application\/json(?:\s*;|$)|^text\/plain(?:\s*;|$)/.test(contentType))return json(res,415,{ok:false,error:'Unsupported content type'});
      const b=await body(req);
      if(!b||typeof b!=='object'||Array.isArray(b)||!ANALYTICS_PAGE_SET.has(b.page)||typeof b.visitStart!=='boolean')
        return json(res,400,{ok:false,error:'Invalid analytics event'});
      recordPublicPageView(b.page,b.visitStart);
      res.setHeader('Cache-Control','no-store');
      return json(res,202,{ok:true});
    }

    if(p==='/api/premium/config'&&req.method==='GET')return json(res,200,{ok:true,...premiumPublic()});
    /* Paystack's signed webhook is the reliable activation path when a customer
       closes the checkout tab or the browser return is interrupted. The redirect
       verifier below remains as a second confirmation route. */
    if(p==='/api/payments/webhook'&&req.method==='POST'){
      if(!PREMIUM_CONFIG.paystackSecretKey)return json(res,503,{ok:false,error:'Paystack webhook is not configured'});
      const raw=await rawBody(req),signature=req.headers['x-paystack-signature'];
      if(!validPaystackSignature(raw,signature))return json(res,401,{ok:false,error:'Invalid Paystack signature'});
      let event;try{event=JSON.parse(raw.toString('utf8'))}catch{return json(res,400,{ok:false,error:'Invalid webhook payload'})}
      const data=event?.data||{},reference=String(data.reference||'');
      if(event?.event==='charge.success'&&reference){
        const tx=premiumStore.transactions.find(x=>x.reference===reference);
        if(!tx){audit('payment.webhook.unmatched','paystack',{reference});return json(res,200,{ok:true,processed:false})}
        if(!validPaystackTransaction(tx,data)){
          notifyAdmin('payment.webhook.invalid','A signed Paystack success event did not match its pending transaction',{reference,transactionId:tx.id});
          audit('payment.webhook.invalid','paystack',{reference,transactionId:tx.id});
          return json(res,200,{ok:true,processed:false});
        }
        const duplicate=tx.status==='success';await settlePayment(reference,true);
        return json(res,200,{ok:true,processed:!duplicate});
      }
      if(event?.event==='charge.failed'&&reference){
        const tx=premiumStore.transactions.find(x=>x.reference===reference);
        if(tx&&tx.status==='pending'){tx.status='failed';tx.failedAt=new Date().toISOString();savePremiumStore();audit('payment.failed',tx.userId,{reference,plan:tx.plan})}
      }
      return json(res,200,{ok:true,ignored:!['charge.success','charge.failed'].includes(event?.event)});
    }
    if(p==='/api/auth/register'&&req.method==='POST'){
      const b=await body(req),email=String(b.email||'').trim().toLowerCase(),password=String(b.password||''),name=String(b.name||'').trim().slice(0,80),ref=String(b.referralCode||'').trim().toUpperCase();
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<8)return json(res,400,{ok:false,error:'Use a valid email and a password of at least 8 characters'});
      if(email===PREMIUM_CONFIG.adminEmail)return json(res,400,{ok:false,error:'This email is reserved for the administrator'});
      if(premiumStore.users.some(u=>u.email===email))return json(res,409,{ok:false,error:'An account with this email already exists'});
      const inviter=premiumStore.users.find(u=>u.referralCode===ref&&u.email!==email);const u=startUser(email,name,password,inviter?.referralCode||'');
      if(inviter){addWallet(inviter,100,'signup','Verified referral signup reward',{fromUser:u.id});notifyAdmin('referral.signup',inviter.email+' earned a referral signup reward',{referrer:inviter.id,newUser:u.id})}
      const token=crypto.randomBytes(32).toString('hex');premiumSessions.set(token,{userId:u.id,role:'user',email:u.email,createdAt:Date.now()});setSession(req,res,token);savePremiumStore();audit('auth.register',u.id,{referred:!!inviter});
      return json(res,201,{ok:true,user:publicUser(u),message:'Your 30-day free trial has started'});
    }
    if(p==='/api/auth/logout'&&req.method==='POST'){const c=parseCookies(req).kb_session;if(c)premiumSessions.delete(c);clearSession(res);return json(res,200,{ok:true})}
    /* ---------- "Keep me signed in" ----------
       "Remember my password" must never store the password itself: anyone with the
       device could read it straight out of localStorage. Instead the browser keeps
       only the email for prefill, and the SERVER decides how long the session token
       lives. Default = session cookie that dies with the browser tab; opted-in = a
       30-day Max-Age cookie that survives a restart. */
    if(p==='/api/auth/login'&&req.method==='POST'){
      const b=await body(req),email=String(b.email||'').trim().toLowerCase(),password=String(b.password||''),remember=b.remember!==false;
      if(email===PREMIUM_CONFIG.adminEmail&&PREMIUM_CONFIG.adminPassword&&password===PREMIUM_CONFIG.adminPassword){const token=crypto.randomBytes(32).toString('hex');premiumSessions.set(token,{role:'admin',email,createdAt:Date.now()});setSession(req,res,token);audit('admin.login',email,{});return json(res,200,{ok:true,user:{email,role:'admin',plan:'unlimited',status:'admin'}})}
      const u=premiumStore.users.find(x=>x.email===email);
      if(!u||!passwordOk(password,u.passwordHash))return json(res,401,{ok:false,error:'Email or password is incorrect'});
      /* A Google-only account has a random throwaway password. Saying so is far more
         use than a bare "incorrect", and avoids sending people round a support loop. */
      if(u.authProvider==='google'&&!u.passwordSet)return json(res,401,{ok:false,error:'This account signs in with Google',useGoogle:true});
      const token=crypto.randomBytes(32).toString('hex');premiumSessions.set(token,{userId:u.id,role:'user',email:u.email,createdAt:Date.now(),persistent:remember});setSession(req,res,token,{remember});audit('auth.login',u.id,{remember});return json(res,200,{ok:true,user:publicUser(u)});
    }
    if(p==='/api/auth/me'&&req.method==='GET'){
      const s=sessionRecord(req);if(!s)return json(res,200,{ok:true,user:null});return json(res,200,{ok:true,user:s.role==='admin'?{email:s.email,role:'admin',plan:'unlimited',status:'admin'}:publicUser(s.user)});
    }
    if(p==='/api/payments/initialize'&&req.method==='POST'){
      const s=requireAuth(req,res);if(!s)return;
      const plan=planBy((await body(req)).plan);if(!plan)return json(res,400,{ok:false,error:'Choose a valid subscription plan'});
      if(s.role==='admin')return json(res,200,{ok:true,admin:true,message:'Administrator access is free'});
      const payment=paystackCredentials();if(!payment.ready)return json(res,503,{ok:false,error:payment.reason});
      try{
        /* Return to the app root: startup now verifies the Paystack reference before
           the user has to open the plan modal again. */
        const d=await paystack('/transaction/initialize',{method:'POST',body:JSON.stringify({email:s.user.email,amount:plan.price*100,currency:'NGN',metadata:{userId:s.user.id,plan:plan.id},callback_url:publicOrigin(req)+'/'})});
        premiumStore.transactions.push({id:uid('tx'),reference:d.data.reference,userId:s.user.id,plan:plan.id,amount:plan.price,status:'pending',createdAt:new Date().toISOString()});savePremiumStore();audit('payment.initialize',s.user.id,{plan:plan.id,amount:plan.price});return json(res,200,{ok:true,authorizationUrl:d.data.authorization_url,reference:d.data.reference,accessCode:d.data.access_code});
      }catch(e){return json(res,503,{ok:false,error:e.message})}
    }
    if(p==='/api/payments/verify'&&req.method==='POST'){
      const s=requireAuth(req,res);if(!s)return;
      const payment=paystackCredentials();if(!payment.ready)return json(res,503,{ok:false,error:payment.reason});
      const b=await body(req),reference=String(b.reference||'');if(!reference)return json(res,400,{ok:false,error:'Payment reference is required'});
      const tx=premiumStore.transactions.find(x=>x.reference===reference&&x.userId===s.user.id);if(!tx)return json(res,404,{ok:false,error:'Payment not found'});
      try{const d=await paystack('/transaction/verify/'+encodeURIComponent(reference));
      /* Paystack may add its processing fee to the customer-paid amount. The shared
         validator accepts that gross amount but requires the reference, NGN currency,
         account id and exact plan to match this pending purchase. */
      if(!validPaystackTransaction(tx,d.data))return json(res,400,{ok:false,error:'Payment could not be verified'});
      await settlePayment(reference,true);return json(res,200,{ok:true,user:publicUser(s.user),message:'Subscription activated'});}catch(e){return json(res,503,{ok:false,error:e.message})}
    }
    if(p==='/api/wallet/withdraw'&&req.method==='POST'){
      const s=requireAuth(req,res);if(!s||s.role==='admin')return s?json(res,400,{ok:false,error:'Administrator accounts do not need withdrawals'}):null;
      const b=await body(req),amount=Math.floor(Number(b.amount)),min=1000;
      if(!Number.isFinite(amount)||amount<min||amount>s.user.wallet.balance)return json(res,400,{ok:false,error:'Minimum withdrawal is ₦1,000 and cannot exceed your wallet balance'});
      if(!b.accountName||!b.accountNumber||!b.bankCode)return json(res,400,{ok:false,error:'Bank name, account number and bank code are required'});
      addWallet(s.user,-amount,'withdrawal','Withdrawal request',{withdrawalId:'pending'});const w={id:uid('wd'),userId:s.user.id,amount,accountName:String(b.accountName).slice(0,100),accountNumber:String(b.accountNumber).replace(/\D/g,'').slice(-10),bankCode:String(b.bankCode).slice(0,20),status:'pending',requestedAt:new Date().toISOString(),expectedBy:businessDaysFrom(Date.now(),3)};premiumStore.withdrawals.push(w);notifyAdmin('withdrawal.request','A withdrawal request needs review',{withdrawalId:w.id,userId:s.user.id,amount});audit('wallet.withdrawal.request',s.user.id,{withdrawalId:w.id,amount});return json(res,201,{ok:true,withdrawal:{id:w.id,amount:w.amount,status:w.status,expectedBy:w.expectedBy},user:publicUser(s.user)});
    }
    if(p==='/api/ai/ask'&&req.method==='POST'){
      const s=requireAuth(req,res);if(!s)return;
      const allowance=s.role==='admin'?100000:aiAllowance(s.user),used=s.role==='admin'?0:s.user.ai?.month===monthKey()?s.user.ai.used:0;if(used>=allowance)return json(res,402,{ok:false,error:'Your AI allowance is exhausted for this period',upgrade:true});
      if(!PREMIUM_CONFIG.aiApiKey)return json(res,503,{ok:false,error:'AI_API_KEY is not configured on the server'});
      const b=await body(req),question=String(b.question||'').trim().slice(0,4000);if(!question)return json(res,400,{ok:false,error:'Ask a Bible study question'});
      try{const answer=await askAi(question);let remaining=allowance;if(s.role!=='admin'){s.user.ai=s.user.ai?.month===monthKey()?s.user.ai:{month:monthKey(),used:0};s.user.ai.used++;remaining=Math.max(0,allowance-s.user.ai.used);savePremiumStore()}audit('ai.question',s.role==='admin'?s.email:s.user.id,{month:monthKey()});return json(res,200,{ok:true,answer,remaining});}catch(e){return json(res,502,{ok:false,error:e.message})}
    }
    /* ---------- Studio voice: Gemini TTS proxy ----------
       Same guard chain as /api/ai/ask: signed-in, monthly allowance, configured
       key. The response is a real WAV (Gemini's raw PCM wrapped by pcmToWav), so
       an <audio> element plays it directly. Repeated passages hit the disk cache
       and are free, but still require a session so anonymous traffic cannot farm
       audio. Chapters are chunked at sentence boundaries because Gemini TTS has a
       per-request text limit and a whole-chapter single call would be both slow
       and impossible to retry piecewise. */
    if(p==='/api/speak'&&req.method==='POST'){
      const s=requireAuth(req,res);if(!s)return;
      const allowance=s.role==='admin'?100000:ttsAllowance(s.user),used=s.role==='admin'?0:s.user.tts?.month===monthKey()?s.user.tts.used:0;
      if(used>=allowance)return json(res,402,{ok:false,error:'Your studio voice allowance is exhausted for this period',upgrade:true});
      if(!PREMIUM_CONFIG.ttsApiKey)return json(res,503,{ok:false,error:'Studio voice is not configured on the server'});
      const b=await body(req,TTS_BODY_LIMIT),text=String(b.text||'').trim().slice(0,4000);
      if(!text)return json(res,400,{ok:false,error:'Send the text to be read aloud'});
      const chunks=chunkForTts(text);if(!chunks.length)return json(res,400,{ok:false,error:'Send the text to be read aloud'});
      try{
        const dir=ttsDir();if(!fs.existsSync(dir))fs.mkdirSync(dir,{recursive:true});
        let generated=0;const wavs=[];
        for(const c of chunks){
          const f=ttsPathFor(c);let wav;
          if(fs.existsSync(f))wav=fs.readFileSync(f);
          else{wav=await geminiTts(c);fs.writeFileSync(f,wav);generated++}
          wavs.push(wav);
        }
        /* Only freshly generated chunks are charged; a cache hit costs nothing.
           The remaining count is always derived from the stored usage, not from
           this request's generation count — otherwise a cache hit would report
           a full allowance the user does not actually have. Once used reaches
           the allowance the NEXT request is refused with 402. */
        let remaining=allowance;
        if(s.role!=='admin'){s.user.tts=s.user.tts?.month===monthKey()?s.user.tts:{month:monthKey(),used:0};s.user.tts.used+=generated;remaining=Math.max(0,allowance-s.user.tts.used);if(generated)savePremiumStore()}
        audit('tts.speak',s.role==='admin'?s.email:s.user.id,{chars:text.length,chunks:chunks.length,generated});
        /* Every chunk is a complete WAV; drop the 44-byte headers of all but the
           first and rebuild one header around the joined PCM. */
        const out=pcmToWav(Buffer.concat(wavs.map(w=>w.slice(44))));
        res.setHeader('Content-Type','audio/wav');res.setHeader('Content-Length',out.length);res.setHeader('Cache-Control','no-store');res.setHeader('X-TTS-Remaining',String(remaining));
        return res.end(out);
      }catch(e){return json(res,502,{ok:false,error:e.message})}
    }
    if(p==='/api/admin/overview'&&req.method==='GET'){
      if(!requireAdmin(req,res))return;
      res.setHeader('Cache-Control','no-store');
      return json(res,200,adminOverviewData());
    }
    const payoutDetails=p.match(/^\/api\/admin\/withdrawals\/([^/]+)\/details$/);
    if(payoutDetails&&req.method==='GET'){
      const s=requireAdmin(req,res);if(!s)return;
      const w=(premiumStore.withdrawals||[]).find(x=>x.id===payoutDetails[1]);
      if(!w)return json(res,404,{ok:false,error:'Withdrawal not found'});
      res.setHeader('Cache-Control','no-store');
      audit('admin.withdrawal.details',s.email,{withdrawalId:w.id,userId:w.userId});
      return json(res,200,{ok:true,withdrawal:{id:w.id,accountName:w.accountName||'',accountNumber:String(w.accountNumber||''),bankCode:w.bankCode||''}});
    }
    /* The portal could render notifications but had no way to clear them, so the
       unread badge could only ever grow. Marking read is also the audit signal that
       somebody actually reviewed the item. */
    if(p==='/api/admin/notifications/read-all'&&req.method==='POST'){
      const s=requireAdmin(req,res);if(!s)return;
      const unread=(premiumStore.notifications||[]).filter(x=>!x.read).length;
      premiumStore.notifications=premiumStore.notifications.map(x=>({...x,read:true}));
      savePremiumStore();audit('notifications.readAll',s.email,{count:unread});
      return json(res,200,{ok:true,count:unread});
    }
    const markRead=p.match(/^\/api\/admin\/notifications\/([^/]+)\/read$/);
    if(markRead&&req.method==='POST'){
      const s=requireAdmin(req,res);if(!s)return;
      const n=(premiumStore.notifications||[]).find(x=>x.id===markRead[1]);
      if(!n)return json(res,404,{ok:false,error:'Notification not found'});
      n.read=true;savePremiumStore();audit('notification.read',s.email,{notificationId:n.id,type:n.type});
      return json(res,200,{ok:true,notification:n});
    }
    const grant=p.match(/^\/api\/admin\/users\/([^/]+)\/entitlement$/);
    if(grant&&req.method==='POST'){
      const s=requireAdmin(req,res);if(!s)return;
      const u=findUser(grant[1]);if(!u)return json(res,404,{ok:false,error:'User not found'});
      if(u.subscription?.status==='active'&&u.subscription.expiresAt>Date.now()&&!u.subscription.adminGranted)
        return json(res,409,{ok:false,error:'An active paid subscription cannot be replaced by a complimentary grant'});
      const b=await body(req);
      if(!b||typeof b!=='object'||Array.isArray(b))return json(res,400,{ok:false,error:'Invalid grant request'});
      if(Object.hasOwn(b,'forever')&&typeof b.forever!=='boolean')return json(res,400,{ok:false,error:'Permanent access must be selected explicitly'});
      const forever=b.forever===true,hasDuration=Object.hasOwn(b,'durationAmount')||Object.hasOwn(b,'durationUnit')||Object.hasOwn(b,'freeMonths');
      if(forever&&hasDuration)return json(res,400,{ok:false,error:'Choose either a duration or permanent access'});
      const duration=forever?null:grantDuration(b),plan=planBy(b.plan)||PREMIUM_PLANS.unlimited;
      const startedAt=Date.now(),grantId=uid('grt'),expiresAt=forever?Number.MAX_SAFE_INTEGER:addGrantDuration(startedAt,duration.amount,duration.unit);
      u.subscription={status:'active',plan:plan.id,price:0,startedAt,expiresAt,adminGranted:true,grantId,
        ...(duration?{durationAmount:duration.amount,durationUnit:duration.unit}:{})};
      savePremiumStore();
      audit('admin.grant',s.email,{userId:u.id,plan:plan.id,grantId,durationAmount:duration?.amount||null,durationUnit:duration?.unit||null,forever,expiresAt:forever?null:new Date(expiresAt).toISOString()});
      return json(res,200,{ok:true,user:publicUser(u)});
    }
    if(grant&&req.method==='DELETE'){
      const s=requireAdmin(req,res);if(!s)return;
      const u=findUser(grant[1]);if(!u)return json(res,404,{ok:false,error:'User not found'});
      if(u.role==='admin'||u.email===PREMIUM_CONFIG.adminEmail)return json(res,403,{ok:false,error:'The administrator account cannot be changed'});
      if(!u.subscription?.adminGranted)return json(res,409,{ok:false,error:'This account has no administrator-granted access to revoke'});
      const previous=u.subscription,expiresAt=Number(previous.expiresAt);
      u.subscription=null;savePremiumStore();
      audit('admin.grant.revoke',s.email,{userId:u.id,plan:String(previous.plan||''),grantId:previous.grantId||null,expiresAt:Number.isFinite(expiresAt)&&expiresAt<Number.MAX_SAFE_INTEGER?new Date(expiresAt).toISOString():null});
      return json(res,200,{ok:true,user:publicUser(u),message:'Administrator-granted access was revoked'});
    }
    const issueReset=p.match(/^\/api\/admin\/users\/([^/]+)\/password-code$/);
    if(issueReset&&req.method==='POST'){
      const s=requireAdmin(req,res);if(!s)return;const u=findUser(issueReset[1]);
      if(!u)return json(res,404,{ok:false,error:'User not found'});
      if(!u.passwordSet)return json(res,400,{ok:false,error:'This account signs in with Google — no password to reset'});
      /* The plaintext code exists only in this response; the store keeps a hash, and it
         expires in 30 minutes and is single-use. The administrator passes it to the
         account holder over a channel they already trust. */
      const{code,reset}=issueCode(u);
      premiumStore.notifications=premiumStore.notifications.map(n=>n.details?.userId===u.id&&n.type==='password.reset.request'?{...n,read:true}:n);
      audit('admin.password.issue',s.email,{userId:u.id,resetId:reset.id});
      return json(res,200,{ok:true,code,expiresAt:new Date(reset.expiresAt).toISOString(),message:'Share this code with '+u.email+'. It works once and expires in 30 minutes.'});
    }
    /* ---------- account reset and deletion ----------
       The portal could grant access and issue reset codes, but had no way to remove the
       throwaway accounts created while testing, and no way to hand an account back to
       its owner in a clean state after a demo or a revoked subscription. Both live
       here. Destructive by nature, so both are audited, and neither can touch the
       administrator account — that is the one way into the ministry hub. */
    const resetUser=p.match(/^\/api\/admin\/users\/([^/]+)\/reset$/);
    if(resetUser&&req.method==='POST'){
      const s=requireAdmin(req,res);if(!s)return;
      const u=findUser(resetUser[1]);
      if(!u)return json(res,404,{ok:false,error:'User not found'});
      if(u.role==='admin'||u.email===PREMIUM_CONFIG.adminEmail)return json(res,403,{ok:false,error:'The administrator account cannot be reset'});
      const b=await body(req),now=Date.now(),restartTrial=b.restartTrial!==false,clearSub=b.clearSubscription!==false;
      if(restartTrial){u.trialStartedAt=now;u.trialEndsAt=now+30*86400000}
      if(clearSub)u.subscription=null;
      u.ai={month:'',used:0};
      /* Unlinking Google is the "let them sign in again with a different account"
         case: without it the old identity is still bound and the person is stuck. */
      const unlinked=!!b.unlinkGoogle&&!!u.googleSub;
      if(unlinked){delete u.googleSub;delete u.authProvider}
      const clearedPassword=!!b.clearPassword&&!!u.passwordHash;
      if(clearedPassword){delete u.passwordHash;delete u.passwordSet}
      premiumStore.passwordResets=(premiumStore.passwordResets||[]).filter(r=>r.userId!==u.id);
      premiumStore.notifications=premiumStore.notifications.filter(n=>n.details?.userId!==u.id);
      const sessions=dropSessionsFor(u.id);
      savePremiumStore();
      audit('admin.user.reset',s.email,{userId:u.id,email:u.email,restartTrial,clearSubscription:clearSub,unlinkGoogle:unlinked,clearPassword:clearedPassword,sessions});
      return json(res,200,{ok:true,user:publicUser(u),sessionsEnded:sessions,unlinkedGoogle:unlinked,passwordCleared:clearedPassword,message:u.email+' reset — fresh 30-day trial, subscription removed, '+(sessions?sessions+' session'+(sessions===1?'':'s')+' ended':'no active sessions')});
    }
    const deleteUser=p.match(/^\/api\/admin\/users\/([^/]+)$/);
    if(deleteUser&&req.method==='DELETE'){
      const s=requireAdmin(req,res);if(!s)return;
      const u=findUser(deleteUser[1]);
      if(!u)return json(res,404,{ok:false,error:'User not found'});
      if(u.role==='admin'||u.email===PREMIUM_CONFIG.adminEmail)return json(res,403,{ok:false,error:'The administrator account cannot be deleted'});
      /* The audit log is deliberately KEPT: it is the ministry's record that this
         happened, and it holds no payment data. Everything that identifies the
         person or moves their money is removed with them. */
      const payments=(premiumStore.transactions||[]).filter(t=>t.userId===u.id).length;
      const payouts=(premiumStore.withdrawals||[]).filter(w=>w.userId===u.id).length;
      premiumStore.users=premiumStore.users.filter(x=>x.id!==u.id);
      premiumStore.transactions=(premiumStore.transactions||[]).filter(t=>t.userId!==u.id);
      premiumStore.withdrawals=(premiumStore.withdrawals||[]).filter(w=>w.userId!==u.id);
      premiumStore.notifications=premiumStore.notifications.filter(n=>n.details?.userId!==u.id);
      premiumStore.passwordResets=(premiumStore.passwordResets||[]).filter(r=>r.userId!==u.id);
      /* Referrals earned by others for this signup stay paid — unwinding a reward
         already credited to a member would be the wrong kind of surprise. */
      const sessions=dropSessionsFor(u.id);
      savePremiumStore();
      audit('admin.user.delete',s.email,{userId:u.id,email:u.email,referralCode:u.referralCode,payments,payouts,sessions});
      return json(res,200,{ok:true,deleted:u.id,email:u.email,paymentsRemoved:payments,payoutsRemoved:payouts,sessionsEnded:sessions,message:u.email+' deleted — '+(sessions?sessions+' session'+(sessions===1?'':'s')+' ended':'no active sessions')});
    }
    const payWithdrawal=p.match(/^\/api\/admin\/withdrawals\/([^/]+)\/pay$/);
    if(payWithdrawal&&req.method==='POST'){
      const s=requireAdmin(req,res);if(!s)return;
      const w=premiumStore.withdrawals.find(x=>x.id===payWithdrawal[1]);
      if(!w)return json(res,404,{ok:false,error:'Withdrawal not found'});
      if(w.status!=='pending')return json(res,409,{ok:false,error:'This withdrawal is already '+String(w.status||'settled')});
      w.status='paid';w.paidAt=new Date().toISOString();w.paidBy=s.email;
      premiumStore.notifications=premiumStore.notifications.map(n=>n.details?.withdrawalId===w.id?{...n,read:true}:n);
      savePremiumStore();audit('admin.withdrawal.paid',s.email,{withdrawalId:w.id,amount:w.amount,userId:w.userId});
      /* A confirmation needs the settlement identity, not the member's bank data. */
      return json(res,200,{ok:true,withdrawal:{id:w.id,status:w.status,paidAt:w.paidAt,paidBy:w.paidBy}});
    }

    if(p==='/api/auth/google'&&req.method==='POST'){
      let g;const gb=await body(req);
      try{g=await verifyGoogleCredential(String(gb.credential||''))}catch(e){return json(res,400,{ok:false,error:e.message})}
      /* The owner already has a password and full admin rights. Refusing Google here
         keeps a single, unambiguous way into the administrator account. */
      if(g.email===PREMIUM_CONFIG.adminEmail)return json(res,403,{ok:false,error:'Administrator accounts sign in with a password'});
      /* A Google signup must honour ?ref= exactly like the email form, otherwise the
         shared link silently drops the inviter's commission. */
      const gRef=String(gb.referralCode||'').trim().toUpperCase();
      let u=premiumStore.users.find(x=>x.email===g.email),linked=false,created=false;
      if(u){
        /* Same email, different Google identity = someone re-authorising, or a hijack
           attempt. Never silently re-point the link. */
        if(u.googleSub&&u.googleSub!==g.sub)return json(res,409,{ok:false,error:'This email is already linked to a different Google account'});
        if(!u.googleSub){u.googleSub=g.sub;u.authProvider='google';linked=true}
      }else{
        /* A random throwaway password means password login can never succeed for a
           Google-only account, and passwordOk() never has to special-case an empty hash. */
        const gInviter=gRef?premiumStore.users.find(x=>x.referralCode===gRef&&x.email!==g.email):null;
        u=startUser(g.email,g.name,crypto.randomBytes(24).toString('hex'),gInviter?.referralCode||'');
        u.authProvider='google';u.googleSub=g.sub;u.googlePicture=g.picture;u.passwordSet=false;created=true;
        if(gInviter){addWallet(gInviter,100,'signup','Verified referral signup reward',{fromUser:u.id});notifyAdmin('referral.signup',gInviter.email+' earned a referral signup reward',{referrer:gInviter.id,newUser:u.id})}
      }
      const token=crypto.randomBytes(32).toString('hex');premiumSessions.set(token,{userId:u.id,role:'user',email:u.email,createdAt:Date.now()});setSession(req,res,token);savePremiumStore();
      audit(linked?'auth.google.link':'auth.google',u.id,{provider:'google',created});
      return json(res,created?201:200,{ok:true,user:publicUser(u),message:created?'Welcome — your 30-day free trial has started':linked?'Google sign-in linked to your existing account':'Signed in with Google'});
    }
    /* ---------- profile photo + referral + wallet ---------- */
    if(p==='/api/account/profile'&&req.method==='POST'){
      const s=requireAuth(req,res);if(!s)return;
      if(s.role==='admin')return json(res,400,{ok:false,error:'Administrator accounts sign in with a password'});
      const b=await body(req,PHOTO_BODY_LIMIT);
      const name=String(b.name??'').trim().slice(0,80);
      if(name)s.user.name=name;
      /* The photo arrives as a data URL. Only real raster image types are accepted and
         the decoded byte count is capped, so the store cannot be filled with an
         arbitrary payload through this field. */
      if(typeof b.avatar==='string'){
        if(b.avatar===''){s.user.avatar='';}
        else{
          const m=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(b.avatar.trim());
          if(!m)return json(res,400,{ok:false,error:'Profile photo must be a PNG, JPEG or WebP image'});
          const bytes=Buffer.byteLength(m[2],'base64');
          if(bytes>512*1024)return json(res,400,{ok:false,error:'Profile photo must be smaller than 512 KB'});
          s.user.avatar=b.avatar.trim();
        }
      }
      savePremiumStore();audit('account.profile',s.user.id,{hasAvatar:!!s.user.avatar});
      return json(res,200,{ok:true,user:publicUser(s.user)});
    }
    if(p==='/api/wallet'&&req.method==='GET'){
      const s=requireAuth(req,res);if(!s)return;
      if(s.role==='admin')return json(res,200,{ok:true,admin:true,referral:null,ledger:[],withdrawals:[]});
      return json(res,200,{ok:true,referral:referralStats(s.user),ledger:(s.user.wallet?.ledger||[]).slice(0,40),withdrawals:premiumStore.withdrawals.filter(w=>w.userId===s.user.id).slice(0,20),rules:{signupNaira:100,firstPaymentPercent:10,pointValueNaira:1,minWithdrawal:1000,payoutSlaWorkingDays:3}});
    }
    /* ---------- password recovery ----------
       If a transactional email key + verified sender are configured, a short-lived
       single-use code is emailed automatically. Otherwise the administrator-assisted
       WhatsApp path remains available. Responses never reveal whether an email exists. */
    if(p==='/api/auth/password/forgot'&&req.method==='POST'){
      const requestStartedAt=Date.now(),b=await body(req),email=String(b.email||'').trim().toLowerCase();
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return json(res,400,{ok:false,error:'Enter the email address on your account'});
      const u=premiumStore.users.find(x=>x.email===email),emailEnabled=passwordResetEmailEnabled();
      if(u&&u.passwordSet){
        const now=Date.now(),cooldown=60_000,canIssue=!Number(u.passwordResetRequestedAt)||now-Number(u.passwordResetRequestedAt)>=cooldown;
        if(canIssue){
          u.passwordResetRequestedAt=now;
          notifyAdmin('password.reset.request','Password reset requested for '+u.email,{userId:u.id,email:u.email});
          audit('auth.password.forgot',u.id,{source:'self-service',delivery:emailEnabled?'email':'admin'});
          if(emailEnabled){
            const{code,reset}=issueCode(u);
            /* Do not wait for Resend here: response timing must not reveal whether the
               address belongs to an account. The generic acknowledgment is returned
               on a fixed minimum schedule while delivery completes in the background. */
            void sendPasswordResetEmail(u.email,code).then(()=>{
              try{audit('auth.password.email_sent',u.id,{resetId:reset.id})}catch{}
            },e=>{
              try{
                premiumStore.passwordResets=(premiumStore.passwordResets||[]).filter(r=>r.id!==reset.id);
                savePremiumStore();notifyAdmin('password.reset.email.failed','Password reset email could not be delivered',{userId:u.id,reason:String(e.message||e).slice(0,120)});
              }catch{}
            });
          }
        }
      }
      const message=emailEnabled
        ?'If that account exists, a one-time code will be sent to its email. Check spam, or contact support if it does not arrive.'
        :'If that account exists, an administrator will send you a one-time reset code. Contact support on WhatsApp if you need it sooner.';
      const wait=Math.max(0,250-(Date.now()-requestStartedAt));
      if(wait)await new Promise(resolve=>setTimeout(resolve,wait));
      return json(res,202,{ok:true,message,passwordResetEmailEnabled:emailEnabled});
    }
    if(p==='/api/auth/password/reset'&&req.method==='POST'){
      const b=await body(req),email=String(b.email||'').trim().toLowerCase(),code=String(b.code||'').replace(/\D/g,''),password=String(b.newPassword||'');
      if(password.length<8)return json(res,400,{ok:false,error:'Choose a password of at least 8 characters'});
      if(!/^\d{6}$/.test(code))return json(res,400,{ok:false,error:'Enter the 6-digit code from your email or support'});
      const u=premiumStore.users.find(x=>x.email===email);
      const r=(premiumStore.passwordResets||[]).find(x=>u&&x.userId===u.id&&!x.usedAt&&x.expiresAt>Date.now());
      if(!u||!r||Number(r.attempts||0)>=5)return json(res,400,{ok:false,error:'That code is not valid or has expired'});
      if(!passwordOk(code,r.codeHash)){
        r.attempts=(Number(r.attempts)||0)+1;if(r.attempts>=5)r.usedAt=new Date().toISOString();savePremiumStore();
        return json(res,400,{ok:false,error:'That code is not valid or has expired'});
      }
      u.passwordHash=passwordHash(password);u.passwordSet=true;r.usedAt=new Date().toISOString();
      /* Every existing session is dropped so a stolen device cannot keep using the
         account after the real owner recovers it. */
      for(const [t,sess] of premiumSessions)if(sess.userId===u.id)premiumSessions.delete(t);
      savePremiumStore();audit('auth.password.reset',u.id,{userId:u.id});
      return json(res,200,{ok:true,message:'Password updated. You can now sign in with your new password.'});
    }
    if(p==='/api/session/start'&&req.method==='POST'){
      const b=await body(req);
      /* Re-presenting the same code must not rotate it: already-paired phones and
         running vMix inputs would drop off the stream. */
      const want=String(b.pin||'').trim().toUpperCase();
      const code=(want&&codeValid(want))?want:startSession(b.pin);
      return json(res,200,{ok:true,code,url:baseUrl(),addresses:sortedAddresses()});
    }
    if(p==='/api/session/status'&&req.method==='POST'){
      const b=await body(req);
      if(!codeValid(b.code))return json(res,401,{ok:false,error:'Incorrect service code'});
      session.remoteCount=Math.max(1,session.remoteCount);
      return json(res,200,Object.assign({ok:true},snapshot(true)));
    }
    if(p==='/api/remote/action'&&req.method==='POST'){
      const b=await body(req);
      if(!codeValid(b.code))return json(res,401,{ok:false,error:'Incorrect service code'});
      const out=applyAction(b.action);
      return json(res,out.ok?200:400,out);
    }
    if(p==='/api/verse'&&req.method==='GET'){
      const r=resolve(u.searchParams.get('ref'),u.searchParams.get('tr')||'kjv');
      if(!r)return json(res,404,{ok:false,error:'Reference not found'});
      return json(res,200,Object.assign({ok:true},r));
    }
    if(p==='/api/books'&&req.method==='GET'){
      const list=booksList().map(b=>({name:b.name,abbr:b.abbr,chapters:b.chapters,aliases:b.aliases||[]}));
      return json(res,200,{ok:true,books:list});
    }
    if(p==='/api/state'&&req.method==='GET')return json(res,200,Object.assign({ok:true},snapshot(false)));

    if(p==='/api/stream'){
      const b=u.searchParams.get('code');
      if(!codeValid(b))return json(res,401,{ok:false,error:'Incorrect service code'});
      headers(res,'text/event-stream; charset=utf-8');
      res.write('retry: 3000\n\n');
      res.write('event: hello\ndata: '+JSON.stringify(snapshot())+'\n\n');
      session.listeners.add(res);
      const ping=setInterval(()=>{try{res.write(': ping\n\n')}catch{}},20000);
      req.on('close',()=>{clearInterval(ping);session.listeners.delete(res)});
      return;
    }

    /* presentation page must stay reachable even before a session starts */
    if(!p.startsWith('/api/')){
      let f;
      if(p==='/'||p==='/index.html')f=path.join(ROOT,'index.html');
      else if(p==='/remote')f=path.join(ROOT,'remote.html');
      else if(p==='/present'||p==='/present/')f=path.join(ROOT,'index.html');
      else if(p==='/admin'||p==='/admin/'||p==='/admin-portal.html'||p==='/admin.js'){
        /* Every private portal asset requires an existing administrator session.
           The public admin.html is only a static-host handoff page. */
        const g=adminGate(req);
        if(!g.ok){
          const html='<!doctype html><meta charset="utf-8"><title>Administrator</title><body style="font:16px system-ui;background:#07142f;color:#e8ecff;display:grid;place-items:center;height:100vh;margin:0"><div style="max-width:32rem;padding:2rem;text-align:center"><h1 style="font-size:1.25rem;margin:0 0 .75rem">Administrator portal is private</h1><p style="opacity:.75;line-height:1.6">'+escHtml(g.why||'Not available')+'</p></div>';
          res.writeHead(403,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});return res.end(html);
        }
        f=path.join(ROOT,p==='/admin.js'?'admin.js':'admin-portal.html');
      }
      else if(p==='/privacy')f=path.join(ROOT,'privacy.html');
      else if(p==='/refund')f=path.join(ROOT,'refund.html');
      /* vercel.json rewrites /status to status.html and the README documents it, but
         this route was never added here, so the status page 404ed on the ministry PC
         hub while working on the static deployment. */
      else if(p==='/status')f=path.join(ROOT,'status.html');
      else f=path.join(ROOT,path.normalize(p).replace(/^(\.\.[\\/])+/,''));
      if(f.startsWith(ROOT)&&fs.existsSync(f)&&fs.statSync(f).isFile()){
        const ext=path.extname(f),st=fs.statSync(f);
        const live=/^\/present(\/|$)/.test(p)||/^\/remote(\/|$)/.test(p);
        const noStore=/\.html$/i.test(ext)||live||p==='/admin.js';
        res.statusCode=200;
        /* only the capture surfaces may be framed (vMix/OBS browser inputs);
           every other page keeps the SAMEORIGIN clickjacking guard. */
        headers(res,MIME[ext]||'application/octet-stream',live);
        res.setHeader('Cache-Control',noStore?'no-store, must-revalidate':'public, max-age=60');
        res.setHeader('ETag','"'+st.size+'-'+st.mtimeMs+'"');
        if(ext==='.mp4'){
          res.setHeader('Accept-Ranges','bytes');
          const range=req.headers.range;
          if(range){
            const m=String(range).match(/^bytes=(\d*)-(\d*)$/);
            let start=m&&m[1]?Number(m[1]):0,end=m&&m[2]?Number(m[2]):st.size-1;
            if(m&&!m[1]&&m[2]){start=Math.max(0,st.size-Number(m[2]));end=st.size-1}
            if(!m||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<start||start>=st.size){
              res.statusCode=416;res.setHeader('Content-Range',`bytes */${st.size}`);res.setHeader('Content-Length','0');return res.end();
            }
            end=Math.min(end,st.size-1);res.statusCode=206;
            res.setHeader('Content-Range',`bytes ${start}-${end}/${st.size}`);
            res.setHeader('Content-Length',String(end-start+1));
            return fs.createReadStream(f,{start,end}).pipe(res);
          }
          res.setHeader('Content-Length',String(st.size));
        }
        /* The support number is injected here instead of being typed into each page.
           A wrong digit in a static policy page is invisible until a real user tries
           to use it, and there is no test that would catch a stale copy. The origin
           is injected for the same reason on pages that still use {{ORIGIN}}.
           index.html is the exception: its og:image / twitter:image / canonical
           urls are hardcoded to the public Vercel build, because crawlers must
           fetch the share image from a stable public url, never a hub hostname. */
        if(/\.html$/i.test(ext)){
          const html=fs.readFileSync(f,'utf8')
            .replace(/\{\{ORIGIN\}\}/g,escHtml(publicOrigin(req)))
            .replace(/\{\{WHATSAPP\}\}/g,escHtml(SUPPORT_PHONE_DISPLAY))
            .replace(/\{\{WHATSAPP_LINK\}\}/g,escHtml(supportLink('Hello KINGDOM BIBLE support')))
            .replace(/\{\{WHATSAPP_BILLING\}\}/g,escHtml(supportLink('Billing help for KINGDOM BIBLE')));
          res.setHeader('Content-Length',Buffer.byteLength(html));
          return res.end(html);
        }
        return fs.createReadStream(f).pipe(res);
      }
    }
    return json(res,404,{error:'Not found'});
  }catch(e){return json(res,e.statusCode||500,{error:e.message||'Server error'})}
});

server.listen(PORT,HOST,()=>{
  const addrs=sortedAddresses();
  console.log('\n  \u2728 '+APP+' v'+VERSION+' — local-first Scripture hub');
  console.log('  ----------------------------------------------------');
  console.log('  Presenter : http://localhost:'+PORT);
  console.log('  Phone     : http://localhost:'+PORT+'/remote');
  addrs.forEach(a=>console.log('  LAN       : http://'+a+':'+PORT+'  (phone + vMix)'));
  console.log('  Display   : http://<LAN-IP>:'+PORT+'/present?code=<SERVICE-CODE>   (vMix Web Browser input)');
  console.log('  Health    : http://localhost:'+PORT+'/health');
  if(!addrs.length)console.log('  [!] No LAN address detected — connect the phone to the same Wi-Fi as this PC.');
  console.log('  ----------------------------------------------------\n');
});

process.on('SIGINT',()=>{console.log('\nShutting down.');process.exit(0)});

