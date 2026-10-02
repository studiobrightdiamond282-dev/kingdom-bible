#!/usr/bin/env node
'use strict';
/* KINGDOM BIBLE — local-first hub: static hosting, live Scripture presentation, phone remote control */
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto'),os=require('os');
const REF=require('./public/bible-ref.js');
const ROOT=path.join(__dirname,'public'),DATA=path.join(__dirname,'data');
/* Dependency-free .env loader for local ministry servers. Deployment platforms
   should set the same values in their secret manager instead. */
(function loadDotEnv(file){try{if(!fs.existsSync(file))return;for(const line of fs.readFileSync(file,'utf8').split(/\r?\n/)){const m=line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^['"]|['"]$/g,'')}}catch{}})(path.join(__dirname,'.env'));
const PORT=Number(process.env.PORT||4173),HOST='0.0.0.0';
const APP='KINGDOM BIBLE',VERSION='1.2.1';
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.txt':'text/plain; charset=utf-8','.xml':'application/xml; charset=utf-8'};
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
  res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; worker-src 'self'; base-uri 'self'; form-action 'self'; object-src 'none'"+(frameable?'; frame-ancestors *':''));
}
function json(res,status,data){res.statusCode=status;headers(res);res.end(JSON.stringify(data))}

const hits=new Map();
function rate(req,res,limit=300){
  const ip=req.socket.remoteAddress||'local',now=Date.now(),x=hits.get(ip)||{at:now,n:0};
  if(now-x.at>60000){x.at=now;x.n=0}x.n++;hits.set(ip,x);
  if(x.n>limit){json(res,429,{error:'Too many requests'});return false}
  return true;
}
function body(req){
  return new Promise((resolve,reject)=>{let s='';req.on('data',c=>{s+=c;if(s.length>20000){reject(new Error('Payload too large'));req.destroy()}});
    req.on('end',()=>{try{resolve(JSON.parse(s||'{}'))}catch{reject(new Error('Invalid JSON'))}})});
}

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
      const list=booksList(),bk=list[cur.book],chs=bibleData(cur.translation).books[cur.book];
      /* after a range, "next" continues from the END of the range */
      let bi=cur.book,ch=cur.chapter,v=(a.type==='next'?(cur.verseEnd||cur.verse||1):(cur.verse||1))+(a.type==='next'?1:-1);
      if(v<1){if(ch===1){if(bi===0)return{ok:false,error:'Start of Bible'};bi--;ch=list[bi].chapters}else ch--;v=bibleData(cur.translation).books[bi][ch-1].length}
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
  silver:{id:'silver',name:'Silver',price:2500,period:'month',tagline:'A steady Scripture rhythm',benefits:['Full Bible reader and search','Reading plans, notes and bookmarks','100 AI study questions per month','Phone remote and presentation tools'],aiMonthly:100},
  gold:{id:'gold',name:'Gold',price:5000,period:'month',tagline:'For serious personal study',benefits:['Everything in Silver','500 AI study questions per month','Translation comparison and deeper study','Priority feature access'],aiMonthly:500},
  premium:{id:'premium',name:'Premium',price:10000,period:'month',tagline:'The complete ministry toolkit',benefits:['Everything in Gold','2,000 AI study questions per month','Voice Preacher Mode','Ministry presentation and remote'],aiMonthly:2000},
  unlimited:{id:'unlimited',name:'Unlimited',price:20000,period:'month',tagline:'For churches and heavy use',benefits:['Everything in Premium','10,000 AI questions per month (fair use)','Multiple ministry operators','Priority support and early access'],aiMonthly:10000},
};
const PREMIUM_CONFIG={
  adminEmail:String(process.env.ADMIN_EMAIL||'stanley.okonkwo282@gmail.com').trim().toLowerCase(),
  adminPassword:String(process.env.ADMIN_PASSWORD||''),
  paystackPublicKey:String(process.env.PAYSTACK_PUBLIC_KEY||''),
  paystackSecretKey:String(process.env.PAYSTACK_SECRET_KEY||''),
  aiApiKey:String(process.env.AI_API_KEY||''),
  aiApiUrl:String(process.env.AI_API_URL||'https://api.openai.com/v1/chat/completions'),
  aiModel:String(process.env.AI_MODEL||'gpt-4o-mini'),
  storePath:process.env.PREMIUM_STORE_PATH||path.join(__dirname,'.data','premium-store.json'),
};
const premiumSessions=new Map();
function blankPremiumStore(){return{users:[],transactions:[],withdrawals:[],audit:[],notifications:[]}}
function loadPremiumStore(){try{return Object.assign(blankPremiumStore(),JSON.parse(fs.readFileSync(PREMIUM_CONFIG.storePath,'utf8')))}catch{return blankPremiumStore()}}
let premiumStore=loadPremiumStore();
function savePremiumStore(){fs.mkdirSync(path.dirname(PREMIUM_CONFIG.storePath),{recursive:true});fs.writeFileSync(PREMIUM_CONFIG.storePath,JSON.stringify(premiumStore,null,2))}
function uid(prefix){return prefix+'_'+crypto.randomBytes(9).toString('hex')}
function referralCode(){return 'KB'+crypto.randomBytes(4).toString('hex').toUpperCase()}
function passwordHash(password){const salt=crypto.randomBytes(16).toString('hex');return salt+':'+crypto.scryptSync(String(password),salt,32).toString('hex')}
function passwordOk(password,stored){try{const [salt,hash]=String(stored).split(':');const got=crypto.scryptSync(String(password),salt,32);return crypto.timingSafeEqual(got,Buffer.from(hash,'hex'))}catch{return false}}
function parseCookies(req){return Object.fromEntries(String(req.headers.cookie||'').split(';').map(x=>x.trim().split('=').map(decodeURIComponent)).filter(x=>x.length===2))}
function setSession(req,res,session){const secure=String(req.headers?.['x-forwarded-proto']||'').toLowerCase()==='https'||!!req.socket.encrypted;res.setHeader('Set-Cookie',`kb_session=${encodeURIComponent(session)}; HttpOnly; SameSite=Lax; Path=/${secure?'; Secure':''}`)}
function clearSession(res){res.setHeader('Set-Cookie','kb_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0')}
function auth(req){const token=parseCookies(req).kb_session;return token?premiumSessions.get(token)||null:null}
function audit(event,actor,details={}){premiumStore.audit.unshift({id:uid('audit'),event,actor:actor||'system',details,date:new Date().toISOString()});premiumStore.audit=premiumStore.audit.slice(0,1000);savePremiumStore()}
function notifyAdmin(type,message,details={}){premiumStore.notifications.unshift({id:uid('note'),type,message,details,read:false,date:new Date().toISOString()});premiumStore.notifications=premiumStore.notifications.slice(0,200);savePremiumStore()}
function publicUser(u){if(!u)return null;const entitlement=entitlementOf(u);return{id:u.id,email:u.email,name:u.name,role:u.role||'user',referralCode:u.referralCode,trialEndsAt:u.trialEndsAt,plan:entitlement.plan,status:entitlement.status,daysRemaining:entitlement.daysRemaining,walletBalance:u.wallet?.balance||0,createdAt:u.createdAt}}
function entitlementOf(u){
  if(!u)return{plan:'none',status:'signed_out',daysRemaining:0};
  if(u.role==='admin')return{plan:'unlimited',status:'admin',daysRemaining:null};
  const now=Date.now();
  if(u.subscription?.status==='active'&&u.subscription.expiresAt>now)return{plan:u.subscription.plan,status:'active',daysRemaining:Math.ceil((u.subscription.expiresAt-now)/86400000)};
  if(u.trialEndsAt>now)return{plan:'trial',status:'trial',daysRemaining:Math.ceil((u.trialEndsAt-now)/86400000)};
  return{plan:'expired',status:'expired',daysRemaining:0};
}
function findUser(id){return premiumStore.users.find(u=>u.id===id)}
function sessionRecord(req){const a=auth(req);if(!a)return null;if(a.role==='admin')return{...a,user:null};const user=findUser(a.userId);return user?{...a,user}:null}
function requireAuth(req,res){const s=sessionRecord(req);if(!s){json(res,401,{ok:false,error:'Please sign in'});return null}return s}
function requireAdmin(req,res){const s=sessionRecord(req);if(!s||s.role!=='admin'){json(res,403,{ok:false,error:'Administrator access required'});return null}return s}
function addWallet(u,amount,type,description,meta={}){u.wallet=u.wallet||{balance:0,ledger:[]};u.wallet.balance+=amount;u.wallet.ledger.unshift({id:uid('ledger'),amount,type,description,date:new Date().toISOString(),meta});u.wallet.ledger=u.wallet.ledger.slice(0,300)}
function startUser(email,name,password,referredBy){const now=Date.now(),u={id:uid('usr'),email,name:name||email.split('@')[0],passwordHash:passwordHash(password),role:'user',referralCode:referralCode(),referredBy:referredBy||'',referralRewarded:false,trialStartedAt:now,trialEndsAt:now+30*86400000,subscription:null,wallet:{balance:0,ledger:[]},ai:{month:'',used:0},createdAt:new Date(now).toISOString()};premiumStore.users.push(u);return u}
function planBy(id){return PREMIUM_PLANS[String(id||'').toLowerCase()]||null}
function currentPlanFor(u){const e=entitlementOf(u);return e.plan==='trial'?null:planBy(e.plan)}
function businessDaysFrom(date,n){const d=new Date(date);let left=n;while(left){d.setDate(d.getDate()+1);if(![0,6].includes(d.getDay()))left--}return d.toISOString()}
function monthKey(){const d=new Date();return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0')}
function aiAllowance(u){const e=entitlementOf(u);if(e.status==='admin')return 100000;if(e.status==='expired')return 0;if(e.status==='trial')return 25;return currentPlanFor(u)?.aiMonthly||0}
async function paystack(pathname,options={}){if(!PREMIUM_CONFIG.paystackSecretKey)throw new Error('PAYSTACK_SECRET_KEY is not configured');const r=await fetch('https://api.paystack.co'+pathname,{...options,headers:{Authorization:'Bearer '+PREMIUM_CONFIG.paystackSecretKey,'Content-Type':'application/json',...(options.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok||d.status===false)throw new Error(d.message||'Paystack request failed');return d}
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
async function settlePayment(reference,verified){
  const tx=premiumStore.transactions.find(x=>x.reference===reference);if(!tx||tx.status==='success')return tx;
  if(!verified)return tx;
  const u=findUser(tx.userId);if(!u)return tx;
  tx.status='success';tx.paidAt=new Date().toISOString();u.subscription={status:'active',plan:tx.plan,price:tx.amount,startedAt:Date.now(),expiresAt:Date.now()+31*86400000,reference};
  if(u.referredBy&&!u.referralRewarded){const ref=premiumStore.users.find(x=>x.referralCode===u.referredBy&&x.id!==u.id);if(ref){addWallet(ref,Math.round(tx.amount*.1),'commission','10% first-payment referral commission',{fromUser:u.id,reference});u.referralRewarded=true;}}
  savePremiumStore();audit('payment.success',u.id,{reference,plan:tx.plan,amount:tx.amount});return tx;
}
function premiumPublic(){return{plans:Object.values(PREMIUM_PLANS).map(({aiMonthly,...p})=>p),trialDays:30,trialWarningDays:7,referral:{signupNaira:100,firstPaymentPercent:10,pointValueNaira:1,minWithdrawal:1000,payoutSlaWorkingDays:3},paystackPublicKey:PREMIUM_CONFIG.paystackPublicKey,whatsapp:'23481344338808'}}

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

    if(p==='/api/premium/config'&&req.method==='GET')return json(res,200,{ok:true,...premiumPublic()});
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
    if(p==='/api/auth/login'&&req.method==='POST'){
      const b=await body(req),email=String(b.email||'').trim().toLowerCase(),password=String(b.password||'');
      if(email===PREMIUM_CONFIG.adminEmail&&PREMIUM_CONFIG.adminPassword&&password===PREMIUM_CONFIG.adminPassword){const token=crypto.randomBytes(32).toString('hex');premiumSessions.set(token,{role:'admin',email,createdAt:Date.now()});setSession(req,res,token);audit('admin.login',email,{});return json(res,200,{ok:true,user:{email,role:'admin',plan:'unlimited',status:'admin'}})}
      const u=premiumStore.users.find(x=>x.email===email);
      if(!u||!passwordOk(password,u.passwordHash))return json(res,401,{ok:false,error:'Email or password is incorrect'});
      const token=crypto.randomBytes(32).toString('hex');premiumSessions.set(token,{userId:u.id,role:'user',email:u.email,createdAt:Date.now()});setSession(req,res,token);audit('auth.login',u.id,{});return json(res,200,{ok:true,user:publicUser(u)});
    }
    if(p==='/api/auth/me'&&req.method==='GET'){
      const s=sessionRecord(req);if(!s)return json(res,200,{ok:true,user:null});return json(res,200,{ok:true,user:s.role==='admin'?{email:s.email,role:'admin',plan:'unlimited',status:'admin'}:publicUser(s.user)});
    }
    if(p==='/api/auth/logout'&&req.method==='POST'){const c=parseCookies(req).kb_session;if(c)premiumSessions.delete(c);clearSession(res);return json(res,200,{ok:true})}
    if(p==='/api/payments/initialize'&&req.method==='POST'){
      const s=requireAuth(req,res);if(!s)return;
      const plan=planBy((await body(req)).plan);if(!plan)return json(res,400,{ok:false,error:'Choose a valid subscription plan'});
      if(s.role==='admin')return json(res,200,{ok:true,admin:true,message:'Administrator access is free'});
      try{
        const d=await paystack('/transaction/initialize',{method:'POST',body:JSON.stringify({email:s.user.email,amount:plan.price*100,currency:'NGN',metadata:{userId:s.user.id,plan:plan.id},callback_url:String(req.headers.origin||'')+'/#premium'})});
        premiumStore.transactions.push({id:uid('tx'),reference:d.data.reference,userId:s.user.id,plan:plan.id,amount:plan.price,status:'pending',createdAt:new Date().toISOString()});savePremiumStore();audit('payment.initialize',s.user.id,{plan:plan.id,amount:plan.price});return json(res,200,{ok:true,authorizationUrl:d.data.authorization_url,reference:d.data.reference,accessCode:d.data.access_code});
      }catch(e){return json(res,503,{ok:false,error:e.message})}
    }
    if(p==='/api/payments/verify'&&req.method==='POST'){
      const s=requireAuth(req,res);if(!s)return;
      const b=await body(req),reference=String(b.reference||'');if(!reference)return json(res,400,{ok:false,error:'Payment reference is required'});
      const tx=premiumStore.transactions.find(x=>x.reference===reference&&x.userId===s.user.id);if(!tx)return json(res,404,{ok:false,error:'Payment not found'});
      try{const d=await paystack('/transaction/verify/'+encodeURIComponent(reference));
      /* Paystack's verify `amount` is the GROSS charged to the customer, not the
         plan price. When the dashboard has "pass fees to customers" enabled that
         gross includes the transaction fee (Nigeria: 1.5% + NGN 100, so a N2,500
         Silver plan bills 263,960 kobo rather than 250,000). An exact
         `=== tx.amount * 100` test therefore rejected every genuine payment.
         Paystack only ever ADDS the fee, never subtracts it, so requiring the
         charged amount to be AT LEAST the plan price is correct for both fee
         modes while still refusing an underpayment. */
      const charged=Number(d.data?.amount);
      const ok=d.data?.status==='success'&&Number.isFinite(charged)&&charged>=tx.amount*100&&d.data.metadata?.userId===tx.userId;if(!ok)return json(res,400,{ok:false,error:'Payment could not be verified'});await settlePayment(reference,true);return json(res,200,{ok:true,user:publicUser(s.user),message:'Subscription activated'});}catch(e){return json(res,503,{ok:false,error:e.message})}
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
    if(p==='/api/admin/overview'&&req.method==='GET'){
      if(!requireAdmin(req,res))return;return json(res,200,{ok:true,notifications:premiumStore.notifications.slice(0,50),withdrawals:premiumStore.withdrawals.slice(0,100),users:premiumStore.users.map(publicUser),audit:premiumStore.audit.slice(0,150),plans:Object.values(PREMIUM_PLANS).map(({aiMonthly,...x})=>x)});
    }
    const grant=p.match(/^\/api\/admin\/users\/([^/]+)\/entitlement$/);
    if(grant&&req.method==='POST'){
      const s=requireAdmin(req,res);if(!s)return;const u=findUser(grant[1]);if(!u)return json(res,404,{ok:false,error:'User not found'});const b=await body(req),months=Math.max(1,Math.min(12,Number(b.freeMonths)||1)),plan=planBy(b.plan)||PREMIUM_PLANS.unlimited;
      if(b.forever){u.subscription={status:'active',plan:plan.id,price:0,startedAt:Date.now(),expiresAt:Number.MAX_SAFE_INTEGER,adminGranted:true}}else u.subscription={status:'active',plan:plan.id,price:0,startedAt:Date.now(),expiresAt:Date.now()+months*31*86400000,adminGranted:true};savePremiumStore();audit('admin.grant',s.email,{userId:u.id,plan:plan.id,months,forever:!!b.forever});return json(res,200,{ok:true,user:publicUser(u)});
    }
    const payWithdrawal=p.match(/^\/api\/admin\/withdrawals\/([^/]+)\/pay$/);
    if(payWithdrawal&&req.method==='POST'){
      const s=requireAdmin(req,res);if(!s)return;const w=premiumStore.withdrawals.find(x=>x.id===payWithdrawal[1]);if(!w)return json(res,404,{ok:false,error:'Withdrawal not found'});w.status='paid';w.paidAt=new Date().toISOString();w.paidBy=s.email;premiumStore.notifications=premiumStore.notifications.map(n=>n.details?.withdrawalId===w.id?{...n,read:true}:n);savePremiumStore();audit('admin.withdrawal.paid',s.email,{withdrawalId:w.id,amount:w.amount,userId:w.userId});return json(res,200,{ok:true,withdrawal:w});
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
      else if(p==='/admin'||p==='/admin/')f=path.join(ROOT,'admin.html');
      else if(p==='/privacy')f=path.join(ROOT,'privacy.html');
      else if(p==='/refund')f=path.join(ROOT,'refund.html');
      else f=path.join(ROOT,path.normalize(p).replace(/^(\.\.[\\/])+/,''));
      if(f.startsWith(ROOT)&&fs.existsSync(f)&&fs.statSync(f).isFile()){
        const ext=path.extname(f),st=fs.statSync(f);
        const live=/^\/present(\/|$)/.test(p)||/^\/remote(\/|$)/.test(p);
        const noStore=/\.html$/i.test(ext)||live;
        res.statusCode=200;
        /* only the capture surfaces may be framed (vMix/OBS browser inputs);
           every other page keeps the SAMEORIGIN clickjacking guard. */
        headers(res,MIME[ext]||'application/octet-stream',live);
        res.setHeader('Cache-Control',noStore?'no-store, must-revalidate':'public, max-age=60');
        res.setHeader('ETag','"'+st.size+'-'+st.mtimeMs+'"');
        return fs.createReadStream(f).pipe(res);
      }
    }
    return json(res,404,{error:'Not found'});
  }catch(e){return json(res,500,{error:e.message||'Server error'})}
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