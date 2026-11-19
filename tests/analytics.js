#!/usr/bin/env node
'use strict';
/* Privacy contract for anonymous public-reader analytics: only fixed section
   aggregates persist, the Vercel origin is allow-listed, and opt-out/DNT work. */
const assert=require('assert');
const fs=require('fs');
const net=require('net');
const os=require('os');
const path=require('path');
const vm=require('vm');
const {spawn}=require('child_process');
const root=path.join(__dirname,'..');
const origin='https://kingdom-bible-wine.vercel.app';
const serverUrl='https://kingdom-bible.onrender.com';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function storage(seed={}){
  const values=new Map(Object.entries(seed));
  return{getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};
}
function analyticsWindow({pageOrigin=origin,navigator={},local={},session={},fetchImpl}={}){
  const requests=[];
  const fake={location:{origin:pageOrigin},navigator,localStorage:storage(local),sessionStorage:storage(session),
    KingdomHub:{LIVE_HUB_URL:serverUrl+'/'},fetch:fetchImpl||((url,options)=>{requests.push({url,options});return Promise.resolve({ok:true})})};
  vm.runInNewContext(fs.readFileSync(path.join(root,'public/analytics.js'),'utf8'),{window:fake,globalThis:fake});
  return{window:fake,analytics:fake.KingdomAnalytics,requests};
}
async function freePort(){
  return new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(error=>error?reject(error):resolve(port));});});
}
function spawnServer(port,store){
  return spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),NODE_ENV:'test',ADMIN_PASSWORD:'test-admin-password',PREMIUM_STORE_PATH:store,
    ANALYTICS_ENABLED:'true',ANALYTICS_ALLOWED_ORIGINS:origin,PAYSTACK_PUBLIC_KEY:'',PAYSTACK_SECRET_KEY:'',EMAIL_API_KEY:'',EMAIL_FROM:'',AI_API_KEY:''},stdio:['ignore','pipe','pipe']});
}
async function waitReady(base,child){
  let logs='';child.stdout.on('data',chunk=>logs+=chunk);child.stderr.on('data',chunk=>logs+=chunk);
  for(let i=0;i<80;i++){
    if(child.exitCode!==null)throw Error('analytics test server exited: '+logs);
    try{const response=await fetch(base+'/health');if(response.ok)return}catch{}
    await delay(50);
  }
  throw Error('analytics test server did not start: '+logs);
}
async function stop(child){
  if(!child||child.exitCode!==null)return;
  await new Promise(resolve=>{
    const timer=setTimeout(()=>child.kill('SIGKILL'),1500);timer.unref?.();
    child.once('exit',()=>{clearTimeout(timer);resolve();});
    child.kill('SIGTERM');
  });
}
async function login(base){
  const response=await fetch(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'stanley.okonkwo282@gmail.com',password:'test-admin-password'})});
  assert.equal(response.status,200,'the analytics test admin can sign in');
  const setCookie=response.headers.getSetCookie?.()[0]||response.headers.get('set-cookie')||'';
  const cookie=setCookie.match(/kb_session=[^;]+/)?.[0]||'';
  assert(cookie,'admin login returns a session cookie');
  return cookie;
}
async function main(){
  const appAnalytics=analyticsWindow();
  assert.equal(appAnalytics.analytics.isOptedOut(),false);
  await appAnalytics.analytics.trackPage('home');
  await appAnalytics.analytics.trackPage('bible');
  assert.equal(appAnalytics.requests.length,2,'each allow-listed reader section is counted');
  assert.equal(appAnalytics.requests[0].url,serverUrl+'/api/analytics/pageview','the static reader sends analytics only to the live account service');
  assert.equal(appAnalytics.requests[0].options.credentials,'omit','analytics never sends account cookies');
  assert.equal(appAnalytics.requests[0].options.referrerPolicy,'no-referrer','analytics requests omit the page referrer');
  const firstPayload=JSON.parse(appAnalytics.requests[0].options.body),secondPayload=JSON.parse(appAnalytics.requests[1].options.body);
  assert.deepEqual(Object.keys(firstPayload).sort(),['page','visitStart']);
  assert.equal(firstPayload.page,'home');assert.equal(firstPayload.visitStart,true);
  assert.equal(secondPayload.page,'bible');assert.equal(secondPayload.visitStart,false,'the tab-session flag is only counted once per tab');
  await appAnalytics.analytics.trackPage('John 3:16');
  await appAnalytics.analytics.trackPage('home?search=secret');
  assert.equal(appAnalytics.requests.length,2,'unapproved page strings and query-like values are never sent');
  appAnalytics.analytics.setOptOut(true);
  await appAnalytics.analytics.trackPage('search');
  assert.equal(appAnalytics.requests.length,2,'the local opt-out prevents further requests');
  appAnalytics.analytics.setOptOut(false);
  const dnt=analyticsWindow({navigator:{doNotTrack:'1'}});
  await dnt.analytics.trackPage('home');assert.equal(dnt.requests.length,0,'Do Not Track is respected');
  const gpc=analyticsWindow({navigator:{globalPrivacyControl:true}});
  await gpc.analytics.trackPage('home');assert.equal(gpc.requests.length,0,'Global Privacy Control is respected');
  const optedOut=analyticsWindow({local:{'kingdom-bible.analytics.opt-out':'1'}});
  await optedOut.analytics.trackPage('home');assert.equal(optedOut.requests.length,0,'a stored local opt-out is respected');
  const nonProduction=analyticsWindow({pageOrigin:'http://localhost:4173'});
  await nonProduction.analytics.trackPage('home');assert.equal(nonProduction.requests.length,0,'local hubs do not send public-site analytics');

  const privacy=fs.readFileSync(path.join(root,'public/privacy.html'),'utf8');
  assert(privacy.includes('analyticsPreferenceButton')&&privacy.includes('/privacy-analytics.js'),'the privacy page exposes a local opt-out control');
  for(const term of ['page views by broad app section and day','not unique-person counts','IP addresses','browser fingerprints','search terms','Scripture references','400 days'])assert(privacy.includes(term),'privacy disclosure includes '+term);
  const vercel=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));
  assert(vercel.headers.some(block=>block.headers?.some(h=>h.key==='Content-Security-Policy'&&h.value.includes(serverUrl))),'Vercel CSP permits the analytics API host');
  const sw=fs.readFileSync(path.join(root,'public/sw.js'),'utf8');
  assert(sw.includes("'/analytics.js'")&&sw.includes("'/privacy-analytics.js'"),'analytics code and the privacy preference control are available offline');

  const store=path.join(os.tmpdir(),'kingdom-bible-analytics-'+process.pid+'.json');
  let child;
  try{
    let port=await freePort(),base='http://127.0.0.1:'+port;
    child=spawnServer(port,store);await waitReady(base,child);
    const preflight=await fetch(base+'/api/analytics/pageview',{method:'OPTIONS',headers:{origin,'access-control-request-method':'POST','access-control-request-headers':'content-type'}});
    assert.equal(preflight.status,204,'the public analytics endpoint answers a browser CORS preflight');
    assert.equal(preflight.headers.get('access-control-allow-origin'),origin);
    assert.match(preflight.headers.get('access-control-allow-methods')||'',/POST/);
    const send=async(page,visitStart,extra={})=>fetch(base+'/api/analytics/pageview',{method:'POST',headers:{origin,'content-type':'text/plain;charset=UTF-8'},body:JSON.stringify({page,visitStart,...extra})});
    let response=await send('home',true,{visitorId:'raw-event-must-not-persist',ip:'203.0.113.9',searchTerm:'Psalm 23'});
    assert.equal(response.status,202,'a valid anonymous page-view event is accepted');
    assert.equal(response.headers.get('access-control-allow-origin'),origin);
    response=await send('bible',false);assert.equal(response.status,202);
    response=await send('home',false);assert.equal(response.status,202);
    assert.equal((await send('john-3-16',false)).status,400,'unapproved page values are rejected');
    assert.equal((await send('home','false')).status,400,'session-start must be boolean');
    const denied=await fetch(base+'/api/analytics/pageview',{method:'POST',headers:{origin:'https://untrusted.example','content-type':'text/plain'},body:JSON.stringify({page:'home',visitStart:true})});
    assert.equal(denied.status,403,'analytics writes are CORS-allow-listed to the public site');
    const noAdmin=await fetch(base+'/api/admin/overview');assert.equal(noAdmin.status,403,'aggregate analytics remain behind the admin session');
    const contents=fs.readFileSync(store,'utf8'),saved=JSON.parse(contents),today=new Date().toISOString().slice(0,10),bucket=saved.analytics.daily[today];
    assert(!contents.includes('raw-event-must-not-persist')&&!contents.includes('203.0.113.9')&&!contents.includes('Psalm 23'),'raw client identifiers and search text are never saved');
    assert.deepEqual(Object.keys(bucket).sort(),['pages','views','visits']);
    assert.equal(bucket.views,3);assert.equal(bucket.visits,1);assert.deepEqual(bucket.pages,{home:2,bible:1});
    assert(!Object.hasOwn(saved.analytics,'events'),'no raw visit-event history is stored');
    let cookie=await login(base);
    let overview=await fetch(base+'/api/admin/overview',{headers:{cookie}});
    let dashboard=await overview.json();
    assert.equal(overview.status,200);assert.equal(dashboard.analytics.totalViews,3);assert.equal(dashboard.analytics.totalVisits,1);
    assert.equal(dashboard.analytics.pages.find(row=>row.page==='home').views,2);
    assert.equal(dashboard.analytics.pages.find(row=>row.page==='bible').views,1);

    await stop(child);child=null;
    port=await freePort();base='http://127.0.0.1:'+port;
    child=spawnServer(port,store);await waitReady(base,child);
    cookie=await login(base);
    overview=await fetch(base+'/api/admin/overview',{headers:{cookie}});dashboard=await overview.json();
    assert.equal(dashboard.analytics.totalViews,3,'aggregate totals survive a service restart using the configured store');
    assert.equal(dashboard.analytics.totalVisits,1);
  }finally{
    await stop(child);
    try{fs.unlinkSync(store)}catch{}
  }
  console.log('✓ Anonymous analytics: fixed routes, opt-out/DNT/GPC, CORS, aggregate-only storage, admin gating, and restart persistence');
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1});
