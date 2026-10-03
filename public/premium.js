/* KINGDOM BIBLE — secure account, trial, subscription and referral UI.
   Payment verification and entitlement decisions stay on server.js. */
(function(g){
'use strict';
const root=()=>document.querySelector('#modalRoot');
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
let config=null,user=null,googleReady=null;
/* Support contact is served by the server (/api/premium/config) so the number is defined
   in exactly one place. The literal below is only a fallback for the first paint, before
   config has loaded, and must always agree with SUPPORT_PHONE in server.js. */
const FALLBACK_WHATSAPP='2348134438808';
const supportPhone=()=>config?.whatsapp||FALLBACK_WHATSAPP;
const supportText=text=>'https://wa.me/'+supportPhone()+'?text='+encodeURIComponent(text||'Hello KINGDOM BIBLE support');
/* Referral link for the signed-in account. Falls back to a code-less link so the share
   button still works before /api/auth/me has resolved. */
function referralLink(){
  const code=user?.referralCode;
  if(!code)return location.origin+'/';
  return location.origin+'/?ref='+encodeURIComponent(code);
}
function sharePayload(text){
  return text+'\n\nJoin me on KINGDOM BIBLE:\n'+referralLink();
}
/* Loaded on demand, only when someone actually opens sign-in. Putting
   accounts.google.com in the page on every load would slow the app and hand Google
   a request for every reader who never signs in. */
function loadGoogle(){if(googleReady)return googleReady;googleReady=new Promise((resolve,reject)=>{if(!config?.googleClientId)return reject(Error('Google sign-in is not configured'));if(window.google?.accounts?.id)return resolve(window.google.accounts.id);const s=document.createElement('script');s.src='https://accounts.google.com/gsi/client';s.async=true;s.onload=()=>window.google?.accounts?.id?resolve(window.google.accounts.id):reject(Error('Google sign-in could not load'));s.onerror=()=>reject(Error('Google sign-in could not load'));document.head.append(s)});return googleReady}
/* Renders Google's own button into `mount`. The credential is posted to our server,
   which verifies it against Google — the browser is never trusted for the email. */
function googleButton(mount){const host=mount||root().querySelector('#googleMount');if(!host)return;host.innerHTML='';loadGoogle().then(api=>api.initialize({client_id:config.googleClientId,callback:async resp=>{const box=host.querySelector('.premium-form-error')||document.createElement('div');box.className='premium-form-error';try{/* the ?ref= code is sent with the credential so a Google signup still credits the inviter */const d=await apiPost('/api/auth/google',{credential:resp.credential,referralCode:new URLSearchParams(location.search).get('ref')||''});user=d.user;g.onAuth&&g.onAuth(user);account()}catch(x){host.append(box),box.textContent=x.message}}})).then(api=>api.renderButton(host,{theme:'filled_black',size:'large',width:Math.min(360,host.clientWidth||340),text:'continue_with'})).catch(x=>{host.innerHTML=`<p class="gate-note">${esc(x.message)}</p>`})}
async function apiPost(path,body){const r=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Request failed');return d}
async function api(path,opts={}){const r=await fetch(path,{...opts,headers:{'content-type':'application/json',...(opts.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Request failed');return d}
async function load(){try{const [c,m]=await Promise.all([api('/api/premium/config'),api('/api/auth/me')]);config=c;user=m.user||null;return user}catch{return null}}
function close(){root().innerHTML=''}
function shell(body,cls='premium-modal'){root().innerHTML=`<div class="modal-backdrop"><div class="modal ${cls}" role="dialog" aria-modal="true">${body}</div></div>`;root().querySelector('.modal-backdrop').onclick=e=>{if(e.target.classList.contains('modal-backdrop'))close()};root().querySelectorAll('[data-premium-close]').forEach(b=>b.onclick=close)}
function planCards(){return(config?.plans||[]).map(p=>`<article class="premium-plan ${p.id==='premium'?'featured':''}"><div class="eyebrow">${p.name.toUpperCase()}</div><h3>₦${Number(p.price).toLocaleString()}<small>/month</small></h3><p>${esc(p.tagline)}</p><ul>${p.benefits.map(b=>`<li>${esc(b)}</li>`).join('')}</ul><button class="${p.id==='premium'?'primary-btn':'secondary-btn'}" data-buy="${p.id}">Choose ${p.name}</button></article>`).join('')}
function open(){load().then(()=>user?account():landing())}
function landing(){shell(`<div class="modal-head"><div><div class="eyebrow">KINGDOM BIBLE PRO</div><h2>Grow deeper. Serve better.</h2><p>Start with a 30-day free trial. We show a warning when seven days remain.</p></div><button class="close-btn" data-premium-close>×</button></div><div class="premium-notice"><strong>Fair and clear:</strong> subscriptions are charged through Paystack. AI access uses fair-use monthly allowances so you are never exposed to an unexpected bill. Read our <a href="/privacy" target="_blank">Privacy Policy</a> and <a href="/refund" target="_blank">Refund Policy</a>.</div><div class="premium-plans">${planCards()}</div><div class="premium-footer"><button class="secondary-btn" id="premiumLogin">Sign in</button><button class="primary-btn" id="premiumRegister">Start free trial</button><a href="${esc(supportText())}" target="_blank" rel="noopener">Questions? WhatsApp support</a></div>`);
  root().querySelector('#premiumLogin').onclick=()=>auth('login');root().querySelector('#premiumRegister').onclick=()=>auth('register');bindBuy();}
function auth(mode){
  const remembered=mode==='login'?(localStorage.getItem('kb.lastEmail')||''):'';
  const pendingRef=new URLSearchParams(location.search).get('ref')||'';
  shell(`<div class="modal-head"><div><div class="eyebrow">${mode==='login'?'WELCOME BACK':'30-DAY FREE TRIAL'}</div><h2>${mode==='login'?'Sign in to KINGDOM BIBLE':'Create your account'}</h2><p>One secure account across reading, study, and Ministry.</p></div><button class="close-btn" data-premium-close>×</button></div><form id="premiumAuth"><div class="field"><label>Email</label><input id="authEmail" type="email" autocomplete="email" value="${esc(remembered)}" required></div><div class="field" style="margin-top:10px"><label>Password</label><div class="password-field"><input id="authPassword" type="password" minlength="8" autocomplete="${mode==='login'?'current-password':'new-password'}" required><button type="button" class="password-toggle" id="pwToggle" aria-label="Show password" aria-pressed="false">👁</button></div></div>${mode==='register'?`<div class="field" style="margin-top:10px"><label>Name</label><input id="authName" autocomplete="name"></div><div class="field" style="margin-top:10px"><label>Referral code (optional)</label><input id="authReferral" placeholder="KB…" value="${esc(pendingRef)}" autocomplete="off"></div>`:''}${mode==='login'?'<div class="auth-row"><label class="check"><input type="checkbox" id="authRemember" checked><span>Keep me signed in</span></label><button type="button" class="text-btn" id="forgotLink">Forgot password?</button></div>':''}<div id="googleMount" class="google-mount"></div><div class="auth-divider"><span>or continue with email</span></div><div class="premium-form-error" id="authError"></div><div class="modal-actions"><button class="secondary-btn" type="button" id="authBack">Back</button><button class="primary-btn">${mode==='login'?'Sign in':'Start my free trial'}</button></div></form>`);
  bindPasswordToggle();
  const back=root().querySelector('#authBack'),fgt=root().querySelector('#forgotLink');
  if(back)back.onclick=landing;
  if(fgt)fgt.onclick=()=>forgot();
  googleButton();
  root().querySelector('#premiumAuth').onsubmit=async e=>{
    e.preventDefault();
    const err=root().querySelector('#authError');err.textContent='';
    const email=root().querySelector('#authEmail').value.trim();
    const remember=root().querySelector('#authRemember')?.checked!==false;
    /* Only the email is remembered, never the password. Saving a password to
       localStorage would expose every account on a shared ministry laptop. */
    try{email?localStorage.setItem('kb.lastEmail',email):localStorage.removeItem('kb.lastEmail')}catch{}
    try{
      const d=await api('/api/auth/'+(mode==='login'?'login':'register'),{method:'POST',body:JSON.stringify({email,password:root().querySelector('#authPassword').value,name:root().querySelector('#authName')?.value,referralCode:root().querySelector('#authReferral')?.value||pendingRef,remember})});
      user=d.user;g.onAuth&&g.onAuth(user);account();
    }catch(x){err.textContent=x.message}
  };
}
/* Show/hide applies to every password field in the account UI, including the reset form. */
function bindPasswordToggle(){
  const btn=root().querySelector('#pwToggle'),input=root().querySelector('#authPassword')||root().querySelector('#codePassword');
  if(!btn||!input)return;
  btn.onclick=()=>{
    const show=input.type==='password';
    input.type=show?'text':'password';
    btn.textContent=show?'🙈':'👁';
    btn.setAttribute('aria-pressed',String(show));
    btn.setAttribute('aria-label',show?'Hide password':'Show password');
  };
}
/* ---------- forgot password ----------
   No mail provider is wired into this deployment, so the flow states plainly what
   happens next: the user requests a reset, an administrator issues a one-time code,
   and the user exchanges that code for a new password on this screen. */
function forgot(){
  shell(`<div class="modal-head"><div><div class="eyebrow">ACCOUNT RECOVERY</div><h2>Reset your password</h2><p>Enter your account email and we will arrange a one-time reset code.</p></div><button class="close-btn" data-premium-close>×</button></div><form id="forgotForm"><div class="field"><label>Email</label><input id="forgotEmail" type="email" autocomplete="email" value="${esc(localStorage.getItem('kb.lastEmail')||'')}" required></div><div class="premium-form-error" id="forgotError"></div><div class="premium-notice" style="margin-top:14px"><strong>How it works:</strong> this build has no email sender, so an administrator sends your 6-digit code. Request one below, then message us on <a href="${esc(supportText('Password reset for my KINGDOM BIBLE account'))}" target="_blank" rel="noopener">WhatsApp</a> to receive it.</div><div class="modal-actions"><button class="secondary-btn" type="button" id="forgotBack">Back</button><button class="primary-btn">Request code</button></div></form>`);
  root().querySelector('#forgotBack').onclick=()=>auth('login');
  root().querySelector('#forgotForm').onsubmit=async e=>{
    e.preventDefault();
    const err=root().querySelector('#forgotError');err.textContent='';
    const email=root().querySelector('#forgotEmail').value.trim();
    try{
      const d=await api('/api/auth/password/forgot',{method:'POST',body:JSON.stringify({email})});
      try{localStorage.setItem('kb.lastEmail',email)}catch{}
      codeStep(email,d.message);
    }catch(x){err.textContent=x.message}
  };
}
function codeStep(email,message){
  shell(`<div class="modal-head"><div><div class="eyebrow">ACCOUNT RECOVERY</div><h2>Enter your reset code</h2><p>${esc(message||'Enter the 6-digit code from the administrator.')}</p></div><button class="close-btn" data-premium-close>×</button></div><form id="codeForm"><div class="field"><label>Email</label><input id="codeEmail" type="email" value="${esc(email)}" required></div><div class="field" style="margin-top:10px"><label>6-digit code</label><input id="codeValue" inputmode="numeric" maxlength="6" placeholder="000000" required></div><div class="field" style="margin-top:10px"><label>New password</label><div class="password-field"><input id="codePassword" type="password" minlength="8" autocomplete="new-password" required><button type="button" class="password-toggle" id="pwToggle" aria-label="Show password" aria-pressed="false">👁</button></div></div><div class="field" style="margin-top:10px"><label>Confirm new password</label><input id="codeConfirm" type="password" minlength="8" autocomplete="new-password" required></div><div class="premium-form-error" id="codeError"></div><div class="modal-actions"><button class="secondary-btn" type="button" id="codeBack">Back</button><button class="primary-btn">Update password</button></div></form>`);
  bindPasswordToggle();
  root().querySelector('#codeBack').onclick=forgot;
  root().querySelector('#codeForm').onsubmit=async e=>{
    e.preventDefault();
    const err=root().querySelector('#codeError');err.textContent='';
    const pw=root().querySelector('#codePassword').value;
    if(pw!==root().querySelector('#codeConfirm').value){err.textContent='The two passwords do not match';return}
    try{
      const d=await api('/api/auth/password/reset',{method:'POST',body:JSON.stringify({email:root().querySelector('#codeEmail').value.trim(),code:root().querySelector('#codeValue').value,newPassword:pw})});
      close();g.onPasswordReset&&g.onPasswordReset(d.message);
    }catch(x){err.textContent=x.message}
  };
}
function account(){const e=user||{};const warning=e.status==='trial'&&e.daysRemaining<=7?`<div class="premium-warning"><strong>${e.daysRemaining} day${e.daysRemaining===1?'':'s'} left</strong> in your free trial. Choose a plan before access expires.</div>`:'';shell(`<div class="modal-head"><div><div class="eyebrow">${e.role==='admin'?'ADMINISTRATOR ACCESS':'YOUR KINGDOM BIBLE ACCOUNT'}</div><h2>Welcome, ${esc(e.name||e.email)}</h2><p>${e.status==='trial'?'30-day free trial':e.status==='expired'?'Trial expired':e.status==='admin'?'Unlimited admin access':String(e.plan||'').toUpperCase()+' plan'}${e.daysRemaining!=null?' · '+e.daysRemaining+' days remaining':''}</p></div><button class="close-btn" data-premium-close>×</button></div>${warning}<div class="account-grid"><div><strong>₦${Number(e.walletBalance||0).toLocaleString()}</strong><small>referral wallet</small></div><div><strong>${esc(e.referralCode||'—')}</strong><small>your referral code</small></div><div><strong>${e.status==='expired'?'Upgrade required':e.status==='trial'?'Trial access':'Active access'}</strong><small>account status</small></div></div><h3 class="premium-section-title">Choose your plan</h3><div class="premium-plans">${planCards()}</div><div class="referral-box"><strong>Earn with referrals</strong><p>Share your link. You receive ₦100 for a verified signup and 10% of their first successful subscription payment. 1 point equals ₦1. Withdrawals are reviewed by an administrator and paid within three working days.</p><div class="referral-link-row"><input id="referralLink" class="referral-input" readonly value="${esc(referralLink())}" aria-label="Your referral link"></div><div class="referral-actions"><button class="secondary-btn small-btn" id="copyReferral">Copy link</button><button class="primary-btn small-btn" id="shareReferral">Share app</button><button class="secondary-btn small-btn" id="withdrawOpen">Withdraw</button></div></div><div class="premium-footer"><button class="secondary-btn" id="premiumLogout">Sign out</button><a href="/privacy" target="_blank">Privacy</a><a href="/refund" target="_blank">Refunds</a><a href="${esc(supportText())}" target="_blank" rel="noopener">WhatsApp support</a></div>`,'premium-modal');root().querySelector('#premiumLogout').onclick=async()=>{await api('/api/auth/logout',{method:'POST'});user=null;g.onAuth&&g.onAuth(null);landing()};root().querySelector('#withdrawOpen').onclick=withdraw;root().querySelector('#copyReferral').onclick=async()=>{const i=root().querySelector('#referralLink');i.select();try{await navigator.clipboard.writeText(referralLink())}catch{document.execCommand&&document.execCommand('copy')}};root().querySelector('#shareReferral').onclick=()=>shareApp();bindBuy();}
/* Share the app itself. The referral code travels in the URL, so a new user who opens
   the link and signs up credits the person who shared it. */
async function shareApp(){
  const text='Read, study and understand the Word with me on KINGDOM BIBLE.';
  const payload={title:'KINGDOM BIBLE',text,url:referralLink()};
  if(navigator.share){try{await navigator.share(payload);return}catch(x){if(x&&x.name==='AbortError')return}}
  try{await navigator.clipboard.writeText(sharePayload(text))}catch{}
  account();
}
function bindBuy(){root().querySelectorAll('[data-buy]').forEach(b=>b.onclick=async()=>{b.disabled=true;b.textContent='Opening secure checkout…';try{const d=await api('/api/payments/initialize',{method:'POST',body:JSON.stringify({plan:b.dataset.buy})});if(d.admin){alert(d.message);return}if(d.authorizationUrl)location.href=d.authorizationUrl;else throw new Error('Checkout is not configured yet')}catch(e){b.disabled=false;b.textContent='Try again';const n=root().querySelector('.premium-form-error')||document.createElement('div');n.className='premium-form-error';n.textContent=e.message;root().querySelector('.modal')?.append(n)}})}
function withdraw(){shell(`<div class="modal-head"><div><div class="eyebrow">REFERRAL WALLET</div><h2>Request a withdrawal</h2><p>Minimum ₦1,000. An administrator reviews requests and pays within three working days.</p></div><button class="close-btn" data-premium-close>×</button></div><form id="withdrawForm"><div class="field"><label>Amount (₦)</label><input id="withdrawAmount" type="number" min="1000" step="1" required></div><div class="field" style="margin-top:10px"><label>Account name</label><input id="withdrawName" required></div><div class="field" style="margin-top:10px"><label>Bank code</label><input id="withdrawBank" placeholder="e.g. 058" required></div><div class="field" style="margin-top:10px"><label>Account number</label><input id="withdrawAccount" inputmode="numeric" minlength="10" maxlength="10" required></div><div class="premium-form-error" id="withdrawError"></div><div class="modal-actions"><button class="secondary-btn" type="button" data-premium-close>Cancel</button><button class="primary-btn">Submit request</button></div></form>`);root().querySelector('#withdrawForm').onsubmit=async e=>{e.preventDefault();try{const d=await api('/api/wallet/withdraw',{method:'POST',body:JSON.stringify({amount:root().querySelector('#withdrawAmount').value,accountName:root().querySelector('#withdrawName').value,bankCode:root().querySelector('#withdrawBank').value,accountNumber:root().querySelector('#withdrawAccount').value})});user=d.user;account()}catch(x){root().querySelector('#withdrawError').textContent=x.message}}}
g.KingdomPremium={open,load,onAuth:null,onPasswordReset:null,googleButton,forgot,shareApp,supportText,referralLink,get user(){return user},status:()=>user?{signedIn:true,status:user.status,plan:user.plan,daysRemaining:user.daysRemaining,name:user.name,email:user.email,avatar:user.avatar||'',referralCode:user.referralCode,walletBalance:user.walletBalance||0}:{signedIn:false,status:'signed_out'},plans:()=>config?.plans||[],config:()=>config,async saveProfile(name,avatar){const d=await api('/api/account/profile',{method:'POST',body:JSON.stringify({name,avatar})});user=d.user;return user},async wallet(){return api('/api/wallet')},async setPassword(email,code,newPassword){return api('/api/auth/password/reset',{method:'POST',body:JSON.stringify({email,code,newPassword})})}};
})(typeof window!=='undefined'?window:globalThis);
