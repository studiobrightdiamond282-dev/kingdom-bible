#!/usr/bin/env node
'use strict';
/* Checkout UI contract: slow or failed initialization must never leave every plan
   button stuck on "Opening secure checkout". No network or real payment is used. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','public','premium.js'),'utf8');
const appSource=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
const profileStart=appSource.indexOf('function profileReferralLink(');
const profileEnd=appSource.indexOf('\nfunction renderProfile()',profileStart);
assert(profileStart>=0&&profileEnd>profileStart,'Profile must have a role-aware referral renderer');
const profileCode=appSource.slice(profileStart,profileEnd);
const start=source.indexOf('const CHECKOUT_SLOW_MS=');
const end=source.indexOf('\nfunction withdraw()',start);
assert(start>=0&&end>start,'the actual checkout UI handler must exist');
const handler=source.slice(start,end);
const planStart=source.indexOf('function planCards(){');
const planEnd=source.indexOf('\nfunction bindAdminPlanNotice()',planStart);
assert(planStart>=0&&planEnd>planStart,'the plan-card role guard must exist');
const planCardCode=source.slice(planStart,planEnd);
const switchStart=planEnd+1;
const switchEnd=source.indexOf('\nfunction referralBlock(role)',switchStart);
const switchCode=source.slice(switchStart,switchEnd);
const referralStart=switchEnd+1;
const referralEnd=source.indexOf('\nfunction paymentNotice()',referralStart);
assert(referralStart>0&&referralEnd>referralStart,'the role-aware referral block must exist');
const referralCode=source.slice(referralStart,referralEnd);

function planMarkup(role,paystackReady){
  const context={user:{role},config:{paystackReady,plans:[{id:'silver',name:'Silver',price:2500,tagline:'Steady Scripture rhythm',benefits:['Bible reader']}]},esc:value=>String(value)};
  vm.createContext(context);
  vm.runInContext(planCardCode,context,{filename:'premium-plan-cards.js'});
  return context.planCards();
}
function referralMarkup(role){
  const context={referralLink:()=> 'https://example.org/?ref=KB123ABC',esc:value=>String(value)};
  vm.createContext(context);
  vm.runInContext(referralCode,context,{filename:'premium-referral-block.js'});
  return context.referralBlock(role);
}
function profileReferral(account){
  const context={location:{origin:'https://example.org'},encodeURIComponent,esc:value=>String(value)};
  vm.createContext(context);
  vm.runInContext(profileCode,context,{filename:'profile-referral-ui.js'});
  const url=context.profileReferralLink(account);
  return{url,markup:context.profileReferralMarkup(account,url)};
}

function button(plan,label){
  return{
    dataset:{buy:plan},textContent:label,disabled:false,attributes:{},onclick:null,
    setAttribute(name,value){this.attributes[name]=String(value)},
    removeAttribute(name){delete this.attributes[name]},
    getAttribute(name){return this.attributes[name]}
  };
}
function harness(api){
  const buttons=[button('silver','Choose Silver'),button('gold','Choose Gold')];
  const children=[];
  const modal={append(node){children.push(node)},insertBefore(node){children.push(node)}};
  const plans={parentNode:modal,nextSibling:null};
  const dialog={
    querySelectorAll(selector){return selector==='[data-buy]'?buttons:[]},
    querySelector(selector){
      if(selector==='.modal')return modal;
      if(selector==='.premium-plans')return plans;
      if(selector==='.premium-form-error')return children.find(node=>node.className==='premium-form-error')||null;
      return null;
    },
    contains(node){return buttons.includes(node)}
  };
  const timers=[];
  let timerId=0;
  const location={href:'https://kingdom-bible.onrender.com/'};
  const context={
    root:()=>dialog,
    api,
    location,
    document:{createElement(){return{className:'',textContent:'',attributes:{},setAttribute(name,value){this.attributes[name]=String(value)},getAttribute(name){return this.attributes[name]}}}},
    AbortController,
    setTimeout(fn,ms){const timer={id:++timerId,fn,ms,cleared:false};timers.push(timer);return timer},
    clearTimeout(timer){if(timer)timer.cleared=true}
  };
  vm.createContext(context);
  vm.runInContext(handler,context,{filename:'premium-checkout-ui.js'});
  context.bindBuy();
  return{buttons,children,timers,location};
}

(async()=>{
  // An administrator must not be offered purchase controls the server will reject.
  {
    const admin=planMarkup('admin',true);
    assert.match(admin,/Administrator access is complimentary/);
    assert.match(admin,/switchMemberAccount/);
    assert.match(admin,/premium-admin-plan-notice/,'admin guidance spans the plan grid');
    assert(!admin.includes('data-buy='),'admin accounts must not render a Paystack purchase button');
    assert(source.includes("e.role==='admin'?'Administrator access':'Choose your plan'"),'the account screen labels the complimentary admin section clearly');
    assert(source.includes("e.status==='admin'?'Complimentary administrator access':'You are signed in'"),'admin accounts are told their access is complimentary');
    assert((source.match(/bindAdminPlanNotice\(\);bindBuy\(\);/g)||[]).length===2,'both the landing and signed-in account screens bind the account switch button');
    assert(source.includes("const accountSummary=e.role==='admin'?'':"),'admin wallet and referral metrics are not rendered');
    assert(source.includes('${accountSummary}')&&source.includes('${referralBlock(e.role)}'),'the role-specific account and referral UI is rendered');
    const adminReferral=referralMarkup('admin');
    assert.match(adminReferral,/no referral code/);
    assert.match(adminReferral,/standard member account/);
    assert(!adminReferral.includes('id="referralLink"')&&!adminReferral.includes('ref=KB123ABC'),'admins are not shown an untracked referral URL');
    const memberReferral=referralMarkup('user');
    assert(memberReferral.includes('value="https://example.org/?ref=KB123ABC"'),'member referral links retain their tracking code');
    assert(memberReferral.includes('id="copyReferral"')&&memberReferral.includes('id="shareReferral"'),'member referral actions remain available');

    // Profile must not pass off the homepage as a referral link for admins or guests.
    const adminProfile=profileReferral({signedIn:true,role:'admin'});
    assert.equal(adminProfile.url,'','admins must not receive a fabricated referral URL');
    assert.match(adminProfile.markup,/do not have a personal referral code or wallet/);
    assert.match(adminProfile.markup,/does not track or credit signups/);
    assert(!adminProfile.markup.includes('id="profileReferral"')&&!adminProfile.markup.includes('id="walletPanel"'),'admin Profile hides referral and wallet controls');
    assert(appSource.includes("acct.role==='admin'?'Administrator access is complimentary. Referral rewards and withdrawals are available to standard member accounts.'"),'admin membership copy does not promise referral rewards or a member wallet');
    const guestProfile=profileReferral({signedIn:false,role:'user'});
    assert.equal(guestProfile.url,'','signed-out Profile must not present a trackable-looking app URL');
    assert.match(guestProfile.markup,/general app URL does not credit referrals/);
    assert(!guestProfile.markup.includes('id="profileReferral"'),'signed-out Profile has no referral input');
    const memberProfile=profileReferral({signedIn:true,role:'user',referralCode:'KB123ABC'});
    assert.equal(memberProfile.url,'https://example.org/?ref=KB123ABC','a member link is built from that member’s referral code');
    assert(memberProfile.markup.includes('value="https://example.org/?ref=KB123ABC"'),'member Profile keeps the unique tracked link');
    assert(memberProfile.markup.includes('id="copyProfileReferral"')&&memberProfile.markup.includes('id="shareApp"'),'member referral actions remain available in Profile');
    assert(memberProfile.markup.includes('id="walletPanel"'),'member wallet remains visible in Profile');
    assert(source.includes("const pendingRef=new URLSearchParams(location.search).get('ref')||'';"),'the signup form reads the referral code from the shared URL');
    assert(source.includes("referralCode:root().querySelector('#authReferral')?.value||pendingRef"),'email signup submits the captured referral code');
    assert(source.includes("new URLSearchParams(location.search).get('ref') || ''"),'Google signup submits the captured referral code too');
    const codeMissing=profileReferral({signedIn:true,role:'user'});
    assert.equal(codeMissing.url,'','a missing member code never falls back to the generic URL');
    assert.match(codeMissing.markup,/no personal referral code/);
    assert(!codeMissing.markup.includes('id="profileReferral"')&&!codeMissing.markup.includes('id="walletPanel"'),'a member without a code cannot see an untracked link or empty wallet');
    assert(appSource.includes("if(acct.signedIn&&acct.role!=='admin'&&acct.referralCode)loadWalletPanel();"),'Profile only loads a referral wallet for a coded member');

    const member=planMarkup('user',true);
    assert(member.includes('data-buy="silver"'),'regular members retain the plan purchase button');
    const offline=planMarkup('user',false);
    assert.match(offline,/Checkout unavailable/,'member checkout still fails closed when Paystack is not configured');
    let signedOut=0,landed=0;
    const switchButton={onclick:null};
    const context={root:()=>({querySelector:selector=>selector==='#switchMemberAccount'?switchButton:null}),signOut:async()=>{signedOut++},landing:()=>{landed++}};
    vm.createContext(context);
    vm.runInContext(switchCode,context,{filename:'premium-admin-plan-switch.js'});
    context.bindAdminPlanNotice();
    await switchButton.onclick();
    assert.equal(signedOut,1,'switching from admin first signs out');
    assert.equal(landed,1,'switching then opens the regular account sign-in screen');
  }

  // Simulate a request that never resolves until aborted by the real 30-second deadline.
  {
    const h=harness((url,options)=>new Promise((resolve,reject)=>{
      options.signal.addEventListener('abort',()=>{const error=new Error('aborted');error.name='AbortError';reject(error)});
    }));
    const pending=h.buttons[0].onclick();
    assert.equal(h.buttons[0].textContent,'Opening secure checkout…');
    assert(h.buttons.every(item=>item.disabled),'all plan choices are locked while one checkout is starting');
    h.timers.find(timer=>timer.ms===8000).fn();
    assert.equal(h.buttons[0].textContent,'Still connecting…','slow checkout gives visible progress instead of a frozen label');
    h.timers.find(timer=>timer.ms===30000).fn();
    await pending;
    assert(h.buttons.every(item=>!item.disabled),'the timeout restores all plan choices');
    assert.equal(h.buttons[0].textContent,'Try again','the selected plan can be retried');
    assert.equal(h.buttons[0].getAttribute('aria-busy'),undefined,'the button is no longer marked busy');
    assert.match(h.children[0].textContent,/No payment was made/,'timeout explains that Paystack never opened');
    assert.equal(h.children[0].getAttribute('role'),'alert','timeout is announced to assistive technology');
    assert(h.timers.every(timer=>timer.cleared),'all checkout timers are cleaned up');
  }

  // Normal provider/network errors also release the buttons and expose a clear message.
  {
    const h=harness(async()=>{throw new Error('Paystack is temporarily unavailable')});
    await h.buttons[1].onclick();
    assert(h.buttons.every(item=>!item.disabled));
    assert.equal(h.buttons[1].textContent,'Try again');
    assert.match(h.children[0].textContent,/Paystack is temporarily unavailable/);
  }

  // A valid initialization still redirects the same tab to the hosted secure checkout.
  {
    const checkout='https://checkout.paystack.com/kb-test-reference';
    const h=harness(async()=>({authorizationUrl:checkout}));
    await h.buttons[0].onclick();
    assert.equal(h.location.href,checkout);
  }

  // Admin accounts are restored to an idle state instead of being left on the spinner.
  {
    const h=harness(async()=>({admin:true,message:'Administrator access is free'}));
    await h.buttons[0].onclick();
    assert(h.buttons.every(item=>!item.disabled));
    assert.equal(h.buttons[0].textContent,'Choose Silver');
    assert.equal(h.children[0].getAttribute('role'),'status');
  }
  console.log('✓ Paystack checkout UI handles slow, failed, successful, and admin initialization paths');
})().catch(error=>{console.error(error.stack||error);process.exitCode=1});
