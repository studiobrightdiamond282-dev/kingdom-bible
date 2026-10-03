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
/* The full Set-Cookie header is kept, not just the first `;` segment: the "keep me signed
   in" behaviour lives in the Max-Age attribute, which a name=value split would discard. */
async function request(p,o={}){const r=await fetch(base+p,{...o,headers:{'content-type':'application/json',...(o.headers||{})}});const body=await r.json().catch(()=>({}));const raw=r.headers.getSetCookie?r.headers.getSetCookie():[r.headers.get('set-cookie')];return{r,body,cookie:raw[0]||'',session:(String(raw[0]||'').match(/kb_session=[^;]+/)||[''])[0]}}
async function ready(){for(let i=0;i<40;i++){try{const x=await fetch(base+'/health');if(x.ok)return}catch{}await wait(50)}throw Error('premium test server did not start')}
(async()=>{try{
  await ready();
  const cfg=await request('/api/premium/config');assert.equal(cfg.body.trialDays,30);assert(cfg.body.plans.some(p=>p.id==='premium'&&p.price===10000));assert.equal(cfg.body.referral.signupNaira,100);
  const a=await request('/api/auth/register',{method:'POST',body:JSON.stringify({email:'a@example.com',password:'password-a',name:'A'})});assert.equal(a.r.status,201);assert(a.body.user.trialEndsAt);assert(a.cookie);
  const b=await request('/api/auth/register',{method:'POST',body:JSON.stringify({email:'b@example.com',password:'password-b',name:'B',referralCode:a.body.user.referralCode})});assert.equal(b.r.status,201);
  const aMe=await request('/api/auth/me',{headers:{cookie:a.session}});assert.equal(aMe.body.user.walletBalance,100);
  const admin=await request('/api/auth/login',{method:'POST',body:JSON.stringify({email:'stanley.okonkwo282@gmail.com',password:'test-admin-password'})});assert.equal(admin.body.user.role,'admin');
  const overview=await request('/api/admin/overview',{headers:{cookie:admin.session}});assert.equal(overview.body.users.length,2);
  const grant=await request('/api/admin/users/'+a.body.user.id+'/entitlement',{method:'POST',headers:{cookie:admin.session},body:JSON.stringify({plan:'premium',forever:true})});assert.equal(grant.body.user.status,'active');assert.equal(grant.body.user.plan,'premium');
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

  /* ---- support number: one source of truth, no stale digits anywhere ---- */
  assert.equal(cfg.body.whatsapp,'2348134438808','the public config must expose the correct support number');
  assert(cfg.body.whatsappDisplay.includes('813 443 8808'),'the display form must read 813 443 8808');
  const privacy=await (await fetch(base+'/privacy')).text();
  const refund=await (await fetch(base+'/refund')).text();
  for(const page of [privacy,refund]){
    assert(!page.includes('23481344338808'),'a served page must not contain the old wrong number');
    assert(!/\{\{WHATSAPP/.test(page),'every {{WHATSAPP}} placeholder must be injected before serving');
    assert(page.includes('2348134438808'),'the served page must carry the correct number');
  }

  /* ---- referral link is shareable and credits the inviter ---- */
  const w=await request('/api/wallet',{headers:{cookie:a.session}});
  assert.equal(w.body.referral.code,a.body.user.referralCode);
  assert.equal(w.body.referral.invited,1,'the referral count must reflect the invited account');
  assert.equal(w.body.referral.balance,100);
  assert.equal(w.body.referral.canWithdraw,false,'â‚¦100 is below the â‚¦1,000 withdrawal minimum');
  assert.equal(w.body.referral.shortfall,900,'the shortfall to the minimum must be exact');
  assert(w.body.referral.link.includes(a.body.user.referralCode),'the referral link must carry the code');
  assert(w.body.ledger.some(x=>x.type==='signup'),'the signup reward must appear in the ledger');
  const low=await request('/api/wallet/withdraw',{method:'POST',headers:{cookie:a.session},body:JSON.stringify({amount:100,accountName:'A',bankCode:'058',accountNumber:'0123456789'})});
  assert.equal(low.r.status,400,'a withdrawal below the minimum must be rejected');
  assert.equal((await request('/api/wallet')).r.status,401,'wallet must require sign-in');

  /* ---- profile photo: accepted, validated, and cleared ---- */
  const px='data:image/png;base64,'+Buffer.from('fake-png-bytes').toString('base64');
  const prof=await request('/api/account/profile',{method:'POST',headers:{cookie:a.session},body:JSON.stringify({name:'Ada Lovelace',avatar:px})});
  assert.equal(prof.r.status,200);
  assert.equal(prof.body.user.name,'Ada Lovelace');
  assert.equal(prof.body.user.avatar,px,'the profile photo must be stored on the account');
  assert.equal((await request('/api/auth/me',{headers:{cookie:a.session}})).body.user.avatar,px,'the photo must come back on the account, not just the device');
  const bad=await request('/api/account/profile',{method:'POST',headers:{cookie:a.session},body:JSON.stringify({avatar:'data:text/html;base64,PHNjcmlwdD4='})});
  assert.equal(bad.r.status,400,'a non-image data URL must be rejected');
  /* ~525 KB decoded: over the 512 KB image ceiling but inside the transport allowance,
     so the route itself must reject it with a message the reader can act on. */
  const bigRes=await request('/api/account/profile',{method:'POST',headers:{cookie:a.session},body:JSON.stringify({avatar:'data:image/png;base64,'+'A'.repeat(700*1024)})});
  assert.equal(bigRes.r.status,400,'an oversized photo must be rejected');
  assert(/smaller than 512 KB/.test(bigRes.body.error),'the size rejection must be explained');
  /* Beyond even the transport allowance: still a readable error, never a dropped socket. */
  const hugeRes=await request('/api/account/profile',{method:'POST',headers:{cookie:a.session},body:JSON.stringify({avatar:'data:image/png;base64,'+'A'.repeat(2*1024*1024)})});
  assert.equal(hugeRes.body.error,'Payload too large','an oversized request must explain itself, not fail silently');
  assert.equal((await request('/api/account/profile',{method:'POST',headers:{cookie:a.session},body:JSON.stringify({avatar:''})})).body.user.avatar,'','the photo must be removable');

  /* ---- "keep me signed in" is a cookie lifetime decision, not stored plaintext ---- */
  const keep=await request('/api/auth/login',{method:'POST',body:JSON.stringify({email:'a@example.com',password:'password-a',remember:true})});
  assert(/Max-Age=/.test(keep.cookie),'remembering must promote the session to a 30-day cookie');
  const temp=await request('/api/auth/login',{method:'POST',body:JSON.stringify({email:'a@example.com',password:'password-a',remember:false})});
  assert(!/Max-Age=/.test(temp.cookie),'opting out must leave a session cookie that dies with the browser');

  /* ---- forgot password: no account enumeration, admin-issued single-use code ---- */
  const known=await request('/api/auth/password/forgot',{method:'POST',body:JSON.stringify({email:'a@example.com'})});
  const unknown=await request('/api/auth/password/forgot',{method:'POST',body:JSON.stringify({email:'nobody@example.com'})});
  assert.equal(known.r.status,202);
  assert.equal(known.body.message,unknown.body.message,'a reset request must not reveal whether an account exists');
  const noCode=await request('/api/auth/password/reset',{method:'POST',body:JSON.stringify({email:'a@example.com',code:'000000',newPassword:'brand-new-pass'})});
  assert.equal(noCode.r.status,400,'a reset without an issued code must be refused');
  const issue=await request('/api/admin/users/'+a.body.user.id+'/password-code',{method:'POST',headers:{cookie:admin.session},body:'{}'});
  assert.equal(issue.r.status,200);
  assert(/^\d{6}$/.test(issue.body.code),'the reset code must be 6 digits');
  assert.equal((await request('/api/auth/password/reset',{method:'POST',body:JSON.stringify({email:'a@example.com',code:issue.body.code,newPassword:'short'})})).r.status,400,'a too-short new password must be refused');
  const done=await request('/api/auth/password/reset',{method:'POST',body:JSON.stringify({email:'a@example.com',code:issue.body.code,newPassword:'brand-new-pass'})});
  assert.equal(done.r.status,200,'the issued code must work');
  assert.equal((await request('/api/auth/login',{method:'POST',body:JSON.stringify({email:'a@example.com',password:'password-a'})})).r.status,401,'the old password must stop working');
  assert.equal((await request('/api/auth/login',{method:'POST',body:JSON.stringify({email:'a@example.com',password:'brand-new-pass'})})).r.status,200,'the new password must work');
  assert.equal((await request('/api/auth/password/reset',{method:'POST',body:JSON.stringify({email:'a@example.com',code:issue.body.code,newPassword:'another-pass-x'})})).r.status,400,'a reset code must be single-use');
  assert(!JSON.stringify(JSON.parse(fs.readFileSync(store,'utf8'))).includes(issue.body.code),'the plaintext reset code must not be written to disk');

  /* ---- withdrawal is gated on the real balance and reports progress honestly ---- */
  const loginA=await request('/api/auth/login',{method:'POST',body:JSON.stringify({email:'a@example.com',password:'brand-new-pass'})});
  const funded=await request('/api/wallet',{headers:{cookie:loginA.session}});
  const bal=Number(funded.body.referral.balance);
  assert.equal(funded.body.referral.minWithdrawal,1000,'the minimum must be advertised to the client');
  assert.equal(funded.body.referral.canWithdraw,bal>=1000,'the withdraw gate must follow the ₦1,000 minimum exactly');
  assert.equal(funded.body.referral.shortfall,Math.max(0,1000-bal),'the shortfall must equal what is still missing');
  const over=await request('/api/wallet/withdraw',{method:'POST',headers:{cookie:loginA.session},body:JSON.stringify({amount:bal+1,accountName:'Ada',bankCode:'058',accountNumber:'0123456789'})});
  assert.equal(over.r.status,400,'a withdrawal above the balance must be refused');
  const noBank=await request('/api/wallet/withdraw',{method:'POST',headers:{cookie:loginA.session},body:JSON.stringify({amount:1,accountName:'',bankCode:'',accountNumber:''})});
  assert.equal(noBank.r.status,400,'bank details must be required');

  /* ---- the client must be able to tell people an update is ready ---- */
  const appjs=await (await fetch(base+'/app.js')).text();
  assert(appjs.includes('updatefound'),'the client must watch for a waiting service worker');
  assert(appjs.includes('applyUpdate'),'the client must offer an update action');
  const premiumjsText=await (await fetch(base+'/premium.js')).text();
  assert(!/23481344338808/.test(appjs+premiumjsText),'no bundle may hardcode the old wrong number');
  assert(premiumjsText.includes('forgotLink')||premiumjsText.includes('function forgot'),'the sign-in screen must offer password recovery');

  /* ---- the icons must be derived from the real logo, not a stand-in mark ---- */
  for(const icon of ['/favicon.svg','/icons/icon-192.png','/icons/maskable-512.png','/favicon.png']){
    const r=await fetch(base+icon);assert.equal(r.status,200,icon+' must be served');
    assert((await r.arrayBuffer()).byteLength>1000,icon+' must not be an empty placeholder');
  }
  const icon192=await fetch(base+'/icons/icon-192.png');
  assert.equal(icon192.headers.get('content-type'),'image/png','the app icon must be a real PNG');

  console.log('âœ“ premium trial, referral wallet, admin grant, legal routes, support number, profile photo, keep-me-signed-in, password recovery, update notification');
/* ---- admin can reset or delete an account ---- */
  {
    /* The portal previously had no way to remove the throwaway accounts created while
       testing, and no way to hand an account back to its owner in a clean state. */
    const t=await request('/api/auth/register',{method:'POST',body:JSON.stringify({email:'throwaway@example.com',password:'password-t',name:'T'})});
    assert.equal(t.r.status,201);
    const id=t.body.user.id;
    /* Give it a paid plan first, so the reset has something real to remove. */
    await request('/api/admin/users/'+id+'/entitlement',{method:'POST',headers:{cookie:admin.session},body:JSON.stringify({plan:'premium',forever:true})});
    const reset=await request('/api/admin/users/'+id+'/reset',{method:'POST',headers:{cookie:admin.session},body:JSON.stringify({})});
    assert.equal(reset.r.status,200);
    assert.equal(reset.body.user.status,'trial','a reset account must go back to the 30-day free trial');
    assert.equal(reset.body.user.plan,'trial','a reset must drop the granted subscription');
    assert.equal(reset.body.sessionsEnded,1,'a reset must end the account live sessions');
    const stale=await request('/api/auth/me',{headers:{cookie:t.session}});
    assert.equal(stale.body.user,null,'the old session must not survive a reset');
    const stranger=await request('/api/admin/users/'+id+'/reset',{method:'POST',body:JSON.stringify({})});
    assert.equal(stranger.r.status,403,'reset must be refused without an administrator session');

    const gone=await request('/api/admin/users/'+id,{method:'DELETE',headers:{cookie:admin.session}});
    assert.equal(gone.r.status,200);
    assert.equal(gone.body.email,'throwaway@example.com');
    const twice=await request('/api/admin/users/'+id,{method:'DELETE',headers:{cookie:admin.session}});
    assert.equal(twice.r.status,404,'deleting an already-removed account must 404, not silently succeed');
    const signin=await request('/api/auth/login',{method:'POST',body:JSON.stringify({email:'throwaway@example.com',password:'password-t'})});
    assert.equal(signin.r.status,401,'a deleted account must not be able to sign in');
    /* the whole point of deleting a test account: the email is free to sign up again */
    const again=await request('/api/auth/register',{method:'POST',body:JSON.stringify({email:'throwaway@example.com',password:'password-t',name:'T'})});
    assert.equal(again.r.status,201,'the email must be free to register again after deletion');
    const noAdmin=await request('/api/admin/users/'+again.body.user.id,{method:'DELETE'});
    assert.equal(noAdmin.r.status,403,'deletion must be refused without an administrator session');
    const wrongMethod=await request('/api/admin/users/'+again.body.user.id,{method:'GET',headers:{cookie:admin.session}});
    assert.equal(wrongMethod.r.status,404,'a GET must never delete an account');
    await request('/api/admin/users/'+again.body.user.id,{method:'DELETE',headers:{cookie:admin.session}});
    const auditLog=(await request('/api/admin/overview',{headers:{cookie:admin.session}})).body.audit.map(x=>x.event);
    assert(auditLog.includes('admin.user.reset'),'a reset must be recorded in the activity log');
    assert(auditLog.includes('admin.user.delete'),'a deletion must be recorded in the activity log');
    console.log('✓ Admin account reset and deletion, sessions invalidated, both audited');
  }

  /* ---- client account flow: a fresh signup must land on Home, not the plan wall ---- */
  {
    const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
    const prem=fs.readFileSync(path.join(__dirname,'..','public','premium.js'),'utf8');
    assert(!/user=d\.user;g\.onAuth&&g\.onAuth\(user\);account\(\)/.test(prem),
      'sign-in must not open the plan screen immediately after authenticating');
    assert(!/user=d\.user;g\.onAuth&&g\.onAuth\(user\);account\(\)/.test(prem.split('googleButton')[1]||''),
      'Google sign-in must not open the plan screen either');
    assert(/function afterAuth\(u\)\{[\s\S]{0,120}close\(\)/.test(prem),
      'afterAuth must hand control back to the shell and close the modal');
    assert(/navigate\('home',true\)/.test(app),'a completed sign-in must navigate to Home');
    /* Signing in lands people on the plan screen, so that screen must offer an explicit
       way back into the app — otherwise a free trial feels like a paywall with no exit.
       It reuses afterAuth on purpose: one tested path, not a second one that can drift. */
    assert(/id="trialContinue"/.test(prem),'the account/plan screen must render a continue button');
    assert(/Continue my free trial/.test(prem),'a trial user must be offered a "Continue my free trial" button');
    assert(/trialContinue[\s\S]{0,80}afterAuth\(user\)/.test(prem),'the continue button must reuse the post-sign-in path');
    assert(/\$\{continueBlock\}/.test(prem),'the continue block must actually be rendered into the modal');
    /* "Google sign-in is not configured" appeared under the sign-in form on a server
       that was completely healthy. loadGoogle() judged `config` before it had loaded,
       then cached the REJECTED promise, so a single early failure (a blip on a phone
       hotspot) broke Google sign-in for the rest of the page session. */
    assert(/async function ensureConfig\(\)/.test(prem),'Google sign-in must wait for the config rather than assume it arrived');
    assert(/googleReady\.catch\(\(\)=>\{googleReady=null\}\)/.test(prem),'a failed Google load must not be cached forever');
    assert(!/Google sign-in is not configured/.test(prem),'the bare "not configured" message must be replaced with actionable copy');
    assert(/sign in with your email and password/.test(prem),'a Google failure must tell the reader to use email instead');
    /* applyAccount used to re-assign KingdomPremium.onAuth, silently replacing the
       shell handler: the gate never closed on signup and sign-out did nothing. */
    const applyLine=(app.split('function applyAccount')[1]||'').split('\n').find(l=>/accountState=u\?/.test(l))||'';
    assert(!/KingdomPremium\.onAuth/.test(applyLine),'applyAccount must not overwrite KingdomPremium.onAuth');
    assert(/if\(!u\)\{applyAccount\(null\)/.test(app),'a sign-out (onAuth null) must clear the account and restore the gate');
    assert(/id="profileSignOut"/.test(app),'Profile must render a sign-out button');
    assert(/profileSignOut[\s\S]{0,200}signOut\?\.\(\)/.test(app),'the Profile sign-out button must call KingdomPremium.signOut');
    assert(/shareApp,signOut,supportText/.test(prem),'premium.js must export signOut');
    assert(/await signOut\(\)/.test(prem),'the in-modal sign out must reuse the shared signOut helper');
    assert(/function saveQuiet\(\)/.test(app),'a DOM-free persist must exist for the voice path');
    /* the notification bell used to be a permanent "No new notifications" toast:
       a dead control that looked live. It must now report real account state. */
    assert(!/notifBtn'\)\.onclick=\(\)=>toast\('No new notifications'\)/.test(app),
      'the notification bell must not be a hard-coded "no notifications" toast');
    assert(/function openNotifications\(\)/.test(app),'the bell must open a real notifications view');
    assert(/function notifItems\(\)/.test(app),'notifications must be derived from the real account state');
    assert(/\.classList\.toggle\('has-dot'/.test(app),'the bell must show an unread marker when something needs attention');
    assert(/bindNotifications\(\);/.test(app.split('KingdomPremium.onAuth=')[1]||''),
      'the bell must refresh when the account changes');
    /* stale copy: accounts and photo sync genuinely work now */
    assert(!/Secure multi-device accounts are not connected/.test(app),
      'Profile must not still claim accounts are not connected');
    const css=fs.readFileSync(path.join(__dirname,'..','public','styles.css'),'utf8');
    assert(/\.icon-btn\.has-dot/.test(css),'the unread marker needs a style');
  }

  console.log('✓ Client account flow: home after sign-in, reachable sign-out');
  console.log('✓ Notifications reflect real account state; stale profile copy removed');
}catch(e){console.error(e.stack||e);process.exitCode=1}finally{child.kill('SIGTERM');try{fs.unlinkSync(store)}catch{}}})();

