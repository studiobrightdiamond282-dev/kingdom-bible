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
