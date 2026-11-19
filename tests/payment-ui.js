#!/usr/bin/env node
'use strict';
/* Checkout UI contract: slow or failed initialization must never leave every plan
   button stuck on "Opening secure checkout". No network or real payment is used. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','public','premium.js'),'utf8');
const start=source.indexOf('const CHECKOUT_SLOW_MS=');
const end=source.indexOf('\nfunction withdraw()',start);
assert(start>=0&&end>start,'the actual checkout UI handler must exist');
const handler=source.slice(start,end);
const planStart=source.indexOf('function planCards(){');
const planEnd=source.indexOf('\nfunction bindAdminPlanNotice()',planStart);
assert(planStart>=0&&planEnd>planStart,'the plan-card role guard must exist');
const planCardCode=source.slice(planStart,planEnd);
const switchStart=planEnd+1;
const switchEnd=source.indexOf('\nfunction paymentNotice()',switchStart);
const switchCode=source.slice(switchStart,switchEnd);

function planMarkup(role,paystackReady){
  const context={user:{role},config:{paystackReady,plans:[{id:'silver',name:'Silver',price:2500,tagline:'Steady Scripture rhythm',benefits:['Bible reader']}]},esc:value=>String(value)};
  vm.createContext(context);
  vm.runInContext(planCardCode,context,{filename:'premium-plan-cards.js'});
  return context.planCards();
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
    assert(source.includes("e.status==='admin'?'Complimentary access':'Active access'"),'the account summary identifies admin access as complimentary');
    assert((source.match(/bindAdminPlanNotice\(\);bindBuy\(\);/g)||[]).length===2,'both the landing and signed-in account screens bind the account switch button');
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
