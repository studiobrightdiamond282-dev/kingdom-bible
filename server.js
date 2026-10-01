#!/usr/bin/env node
'use strict';
/* KINGDOM BIBLE — local-first hub: static hosting, live Scripture presentation, phone remote control */
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto'),os=require('os');
const ROOT=path.join(__dirname,'public'),DATA=path.join(__dirname,'data');
const PORT=Number(process.env.PORT||4173),HOST='0.0.0.0';
const APP='KINGDOM BIBLE',VERSION='1.1.1';
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.txt':'text/plain; charset=utf-8','.xml':'application/xml; charset=utf-8'};
const THEMES=['royal','dark','light','transparent','sunset','noir'];
const TRANSLATIONS=['kjv','asv','web'];
const MAX_VERSES=40;

function headers(res,type='application/json; charset=utf-8',frameable=false){
  res.setHeader('Content-Type',type);
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=(), usb=(), payment=()');
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

function parseRef(input){
  const key=String(input||'').trim().toLowerCase();
  if(_refCache.has(key))return _refCache.get(key);
  let out=null;
  const m=key.match(/^(.+?)\s+(\d+)(?::(\d+)(?:\s*[-–—]\s*(\d+))?)?$/);
  if(m){
    const q=m[1].replace(/\./g,'').replace(/\s+/g,' ').trim();
    const list=booksList(),clean=s=>String(s).toLowerCase().replace(/\./g,'');
    let bi=list.findIndex(b=>clean(b.name)===q||clean(b.abbr)===q||(b.aliases||[]).some(a=>clean(a)===q));
    if(bi<0)bi=list.findIndex(b=>clean(b.name).startsWith(q)||q.startsWith(clean(b.abbr)));
    if(bi>=0){
      const chapter=+m[2],verse=m[3]?+m[3]:null,verseEnd=m[4]?+m[4]:null;
      if(chapter>=1&&chapter<=list[bi].chapters&&(verse===null||verse>=1))
        out={book:bi,chapter,verse,verseEnd:verseEnd&&verseEnd>verse?verseEnd:null};
    }
  }
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
      let bi=cur.book,ch=cur.chapter,v=(cur.verse||1)+(a.type==='next'?1:-1);
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