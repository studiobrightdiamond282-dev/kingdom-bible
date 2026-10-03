#!/usr/bin/env node
'use strict';
/* Premium foundation contract: trial, referrals, secure admin access, grants,
   policy routes, and Paystack/AI configuration boundaries. No external payment
   or AI call is made in this test. */
const assert=require('assert'),{spawn}=require('child_process'),fs=require('fs'),os=require('os'),path=require('path');
const port=4199,store=path.join(os.tmpdir(),'kingdom-bible-premium-'+process.pid+'.json');
const child=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:String(port),ADMIN_PASSWORD:'test-admin-password',PREMIUM_STORE_PATH:store,PAYSTACK_SECRET_KEY:'',AI_API_KEY:''},stdio:['ignore','pipe','pipe']});
const base='http://127.0.0.1:'+port;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function request(p,o={}){const r=await fetch(base+p,{...o,headers:{'content-type':'application/json',...(o.headers||{})}});const body=await r.json().catch(()=>({}));return{r,body,cookie:r.headers.get('set-cookie')?.split(';')[0]||''}}
async function ready(){for(let i=0;i<40;i++){try{const x=await fetch(base+'/health');if(x.ok)return}catch{}await wait(50)}throw Error('premium test server did not start')}
(async()=>{try{
  await ready();
  const cfg=await request('/api/premium/config');assert.equal(cfg.body.trialDays,30);assert(cfg.body.plans.some(p=>p.id==='premium'&&p.price===10000));assert.equal(cfg.body.referral.signupNaira,100);
  const a=await request('/api/auth/register',{method:'POST',body:JSON.stringify({email:'a@example.com',password:'password-a',name:'A'})});assert.equal(a.r.status,201);assert(a.body.user.trialEndsAt);assert(a.cookie);
  const b=await request('/api/auth/register',{method:'POST',body:JSON.stringify({email:'b@example.com',password:'password-b',name:'B',referralCode:a.body.user.referralCode})});assert.equal(b.r.status,201);
  const aMe=await request('/api/auth/me',{headers:{cookie:a.cookie}});assert.equal(aMe.body.user.walletBalance,100);
  const admin=await request('/api/auth/login',{method:'POST',body:JSON.stringify({email:'stanley.okonkwo282@gmail.com',password:'test-admin-password'})});assert.equal(admin.body.user.role,'admin');
  const overview=await request('/api/admin/overview',{headers:{cookie:admin.cookie}});assert.equal(overview.body.users.length,2);
  const grant=await request('/api/admin/users/'+a.body.user.id+'/entitlement',{method:'POST',headers:{cookie:admin.cookie},body:JSON.stringify({plan:'premium',forever:true})});assert.equal(grant.body.user.status,'active');assert.equal(grant.body.user.plan,'premium');
  for(const page of ['/admin','/privacy','/refund','/status']){const r=await fetch(base+page);assert.equal(r.status,200,page+' must be served')}
  /* Google sign-in must reject anything that is not a genuine, correctly signed,
     unexpired token for THIS app. A forged or malformed credential must never mint a session. */
  assert(cfg.body.googleClientId,'premium config must expose the public Google client id');
  for(const bad of [{},{credential:''},{credential:'not-a-jwt'},{credential:'a.b.c'},{credential:'a.b.c.d'}]){
    const g=await request('/api/auth/google',{method:'POST',body:JSON.stringify(bad)});
    assert.equal(g.r.status,400,'malformed Google credential must be rejected: '+JSON.stringify(bad));
    assert(!g.cookie,'a rejected Google sign-in must not set a session cookie');
  }
  const ga=await request('/api/auth/google',{method:'POST',body:JSON.stringify({credential:'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ4In0.c2ln'})});
  assert.equal(ga.r.status,400,'a token with an unknown signing key must be rejected');
  assert(!ga.cookie,'no session may be minted from an unverified token');
  console.log('✓ premium trial, referral wallet, admin grant, and legal routes');
}catch(e){console.error(e.stack||e);process.exitCode=1}finally{child.kill('SIGTERM');try{fs.unlinkSync(store)}catch{}}})();
