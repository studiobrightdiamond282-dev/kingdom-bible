/* Anonymous, first-party reader analytics.
   Sends only a fixed section slug and a boolean marking the first visit in this
   browser tab session. No account, URL query, referrer, IP, cookie, or device ID is
   included in the payload; the server stores daily aggregates only. */
(function(g){
'use strict';
const OPT_OUT_KEY='kingdom-bible.analytics.opt-out';
const SESSION_KEY='kingdom-bible.analytics.visit-counted';
const PAGES=new Set(['home','bible','study','search','prayer','devotional','plans','ministry','profile','presentation']);
let memorySessionCounted=false;
function privacySignal(){
  const nav=g.navigator||{},dnt=String(nav.doNotTrack||nav.msDoNotTrack||'').toLowerCase();
  return dnt==='1'||dnt==='yes'||nav.globalPrivacyControl===true;
}
function isOptedOut(){
  if(privacySignal())return true;
  try{return g.localStorage.getItem(OPT_OUT_KEY)==='1'}catch{return true}
}
function setOptOut(value){
  if(privacySignal())return true;
  try{
    if(value)g.localStorage.setItem(OPT_OUT_KEY,'1');
    else g.localStorage.removeItem(OPT_OUT_KEY);
    return isOptedOut();
  }catch{return true}
}
function visitStart(){
  if(memorySessionCounted)return false;
  memorySessionCounted=true;
  try{
    if(g.sessionStorage.getItem(SESSION_KEY)==='1')return false;
    g.sessionStorage.setItem(SESSION_KEY,'1');
    return true;
  }catch{return true}
}
function isProductionReader(){return g.location?.origin==='https://kingdom-bible-wine.vercel.app'}
function trackPage(page){
  if(!PAGES.has(page)||!isProductionReader()||isOptedOut()||typeof g.fetch!=='function')return Promise.resolve(false);
  const host=String(g.KingdomHub?.LIVE_HUB_URL||'https://kingdom-bible.onrender.com').replace(/\/+$/,'');
  return g.fetch(host+'/api/analytics/pageview',{
    method:'POST',mode:'cors',credentials:'omit',keepalive:true,referrerPolicy:'no-referrer',
    headers:{'Content-Type':'text/plain'},
    body:JSON.stringify({page,visitStart:visitStart()})
  }).then(response=>response.ok).catch(()=>false);
}
g.KingdomAnalytics={privacySignal,isOptedOut,setOptOut,trackPage};
})(typeof window!=='undefined'?window:globalThis);
