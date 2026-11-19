#!/usr/bin/env node
'use strict';
/* A handoff URL may open the upgrade/account modal once, but refreshing it must
   not reopen the modal. Removing only `upgrade=1` preserves referral/payment data. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
const start=source.indexOf('function consumeUpgradeIntent(){');
const end=source.indexOf('\nasync function init()',start);
assert(start>=0&&end>start,'the upgrade-intent helper must exist before init');
const helper=source.slice(start,end);
const initStart=end+1;
const initEnd=source.indexOf('\nfunction renderNav()',initStart);
assert(initEnd>initStart,'the app init block must exist');
const init=source.slice(initStart,initEnd);
assert.match(init,/consumeUpgradeIntent\(\)/,'app startup consumes the upgrade handoff flag');
assert.match(init,/else if\(openUpgrade\)window\.KingdomPremium\?\.open\?\.\(\)/,'the account modal opens only for the consumed upgrade intent');

function run(href,{failReplace=false}={}){
  const location={href};
  const history={state:{depth:2},calls:[],replaceState(state,title,url){
    this.calls.push({state,title,url});
    if(failReplace)throw new Error('history unavailable');
    location.href=new URL(url,location.href).href;
  }};
  const context={URL,location,history};
  vm.createContext(context);
  vm.runInContext(helper,context,{filename:'consume-upgrade-intent.js'});
  return{result:context.consumeUpgradeIntent(),location,history};
}

{
  const h=run('https://kingdom-bible.onrender.com/?upgrade=1&ref=KB123ABC&reference=PayRef&trxref=PayRef#home');
  assert.equal(h.result,true,'the handoff still opens the account modal once');
  const after=new URL(h.location.href);
  assert.equal(after.searchParams.has('upgrade'),false,'the auto-open flag is removed before refresh');
  assert.equal(after.searchParams.get('ref'),'KB123ABC','the referral attribution code is preserved');
  assert.equal(after.searchParams.get('reference'),'PayRef','the Paystack reference is preserved');
  assert.equal(after.searchParams.get('trxref'),'PayRef','the Paystack fallback reference is preserved');
  assert.equal(after.hash,'#home','the current in-app destination is preserved');
  assert.equal(h.history.calls.length,1,'the existing history entry is replaced, not duplicated');
  assert.deepEqual(h.history.calls[0].state,{depth:2},'the in-app back-navigation state is preserved');
}
{
  const href='https://kingdom-bible.onrender.com/?ref=KB123ABC#profile';
  const h=run(href);
  assert.equal(h.result,false,'ordinary referral links do not open the upgrade modal');
  assert.equal(h.history.calls.length,0);
  assert.equal(h.location.href,href);
}
{
  const href='https://kingdom-bible.onrender.com/?upgrade=0';
  const h=run(href);
  assert.equal(h.result,false,'other upgrade parameter values are not consumed');
  assert.equal(h.history.calls.length,0);
}
{
  const h=run('https://kingdom-bible.onrender.com/?upgrade=1',{failReplace:true});
  assert.equal(h.result,false,'if the URL cannot be safely cleaned, do not reopen the modal on every refresh');
}
console.log('✓ Upgrade handoff opens once, removes only its own query flag, and preserves referral/payment parameters');
