#!/usr/bin/env node
'use strict';
/* Paystack contract tests use a local fake provider only; no real credentials or charge. */
const assert=require('assert');
const {spawn}=require('child_process');
const crypto=require('crypto');
const fs=require('fs');
const http=require('http');
const os=require('os');
const path=require('path');
const root=path.join(__dirname,'..');
const store=path.join(os.tmpdir(),`kingdom-bible-payments-${process.pid}.json`);
const PUBLIC_KEY='pk_test_12345678',SECRET_KEY='sk_test_12345678';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const json=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(data))};
async function listen(server){await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return server.address().port}
async function freePort(){const s=http.createServer();const p=await listen(s);await new Promise(resolve=>s.close(resolve));return p}
async function readBody(req){const chunks=[];for await(const chunk of req)chunks.push(chunk);return Buffer.concat(chunks)}
function sign(raw){return crypto.createHmac('sha512',SECRET_KEY).update(raw).digest('hex')}
function webhook(payload,signature=sign(Buffer.from(JSON.stringify(payload)))){
  const raw=Buffer.from(JSON.stringify(payload));
  return fetch(base+'/api/payments/webhook',{method:'POST',headers:{'content-type':'application/json','x-paystack-signature':signature},body:raw});
}
let base='';

(async()=>{
  const providerTx=new Map();let sequence=0;
  const provider=http.createServer(async(req,res)=>{
    const auth=req.headers.authorization;
    if(auth!=='Bearer '+SECRET_KEY)return json(res,401,{status:false,message:'invalid key'});
    if(req.method==='POST'&&req.url==='/transaction/initialize'){
      const b=JSON.parse((await readBody(req)).toString()||'{}'),reference='KB-TEST-'+(++sequence);
      const tx={reference,amount:b.amount,currency:b.currency,metadata:b.metadata,email:b.email,callback_url:b.callback_url};providerTx.set(reference,tx);
      return json(res,200,{status:true,data:{reference,authorization_url:'https://checkout.paystack.com/'+reference,access_code:'test_'+sequence}});
    }
    const match=req.url.match(/^\/transaction\/verify\/(.+)$/);
    if(req.method==='GET'&&match){
      const reference=decodeURIComponent(match[1]),tx=providerTx.get(reference);if(!tx)return json(res,404,{status:false,message:'transaction not found'});
      const data=tx.verification||{reference,status:'success',amount:tx.amount,currency:tx.currency,metadata:tx.metadata};
      return json(res,200,{status:true,data});
    }
    json(res,404,{status:false,message:'unknown test endpoint'});
  });
  const providerPort=await listen(provider),port=await freePort();
  const child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,NODE_ENV:'test',PORT:String(port),ADMIN_PASSWORD:'test-admin-password',PREMIUM_STORE_PATH:store,PAYSTACK_PUBLIC_KEY:PUBLIC_KEY,PAYSTACK_SECRET_KEY:SECRET_KEY,PAYSTACK_ALLOW_TEST_MODE:'true',PAYSTACK_API_URL:`http://127.0.0.1:${providerPort}`,EMAIL_API_KEY:'',EMAIL_FROM:'',AI_API_KEY:''},stdio:['ignore','pipe','pipe']});
  let logs='';child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
  base='http://127.0.0.1:'+port;
  async function req(url,options={}){
    const response=await fetch(base+url,{...options,headers:{'content-type':'application/json',...(options.headers||{})}});
    const body=await response.json().catch(()=>({}));
    const cookie=(response.headers.getSetCookie?.()[0]||response.headers.get('set-cookie')||'').match(/kb_session=[^;]+/)?.[0]||'';
    return{response,body,cookie};
  }
  async function ready(){for(let i=0;i<80;i++){try{const r=await fetch(base+'/health');if(r.ok)return}catch{}await delay(50)}throw Error('payment test server did not start: '+logs)}
  try{
    await ready();
    const cfg=await req('/api/premium/config');
    assert.equal(cfg.body.paystackReady,true,'matching test-mode keys enable checkout');
    assert.equal(cfg.body.paystackMode,'test');assert.equal(cfg.body.paystackPublicKey,PUBLIC_KEY);
    const inviter=await req('/api/auth/register',{method:'POST',body:JSON.stringify({email:'inviter@example.com',password:'password-inviter',name:'Inviter'})});
    assert.equal(inviter.response.status,201);
    const buyer=await req('/api/auth/register',{method:'POST',body:JSON.stringify({email:'buyer@example.com',password:'password-buyer',name:'Buyer',referralCode:inviter.body.user.referralCode})});
    assert.equal(buyer.response.status,201);
    assert.equal((await req('/api/payments/initialize',{method:'POST',body:JSON.stringify({plan:'silver'})})).response.status,401,'checkout requires a signed-in account');

    const init=await req('/api/payments/initialize',{method:'POST',headers:{cookie:buyer.cookie},body:JSON.stringify({plan:'silver'})});
    assert.equal(init.response.status,200,init.body.error);
    assert.equal(init.body.authorizationUrl,'https://checkout.paystack.com/KB-TEST-1');
    const initialized=providerTx.get(init.body.reference);
    assert.equal(initialized.amount,250000,'Silver is charged in kobo');
    assert.equal(initialized.currency,'NGN');
    assert.equal(initialized.metadata.userId,buyer.body.user.id);
    assert.equal(initialized.metadata.plan,'silver');
    assert(initialized.callback_url.endsWith('/'),'Paystack returns to the app root so the reference is auto-verified');
    assert.equal((await req('/api/payments/verify',{method:'POST',headers:{cookie:inviter.cookie},body:JSON.stringify({reference:init.body.reference})})).response.status,404,'one account cannot verify another account\'s transaction');

    const paymentPayload={reference:init.body.reference,status:'success',amount:253960,currency:'NGN',metadata:initialized.metadata};
    providerTx.get(init.body.reference).verification=paymentPayload;
    const verified=await req('/api/payments/verify',{method:'POST',headers:{cookie:buyer.cookie},body:JSON.stringify({reference:init.body.reference})});
    assert.equal(verified.response.status,200,verified.body.error);
    assert.equal(verified.body.user.status,'active');assert.equal(verified.body.user.plan,'silver');

    const malformed=JSON.stringify({event:'charge.success',data:paymentPayload});
    const badSignature=await fetch(base+'/api/payments/webhook',{method:'POST',headers:{'content-type':'application/json','x-paystack-signature':'00'},body:malformed});
    assert.equal(badSignature.status,401,'unsigned webhook must not activate an account');
    const event={event:'charge.success',data:paymentPayload};
    let hook=await webhook(event);assert.equal(hook.status,200);
    assert.deepEqual(await hook.json(),{ok:true,processed:false},'a webhook may safely retry a browser-verified payment');
    let wallet=await req('/api/wallet',{headers:{cookie:inviter.cookie}});
    assert.equal(wallet.body.referral.balance,350,'signup + first-payment commission are applied once');
    hook=await webhook(event);assert.equal((await hook.json()).processed,false,'repeated webhook deliveries are idempotent');
    wallet=await req('/api/wallet',{headers:{cookie:inviter.cookie}});assert.equal(wallet.body.referral.balance,350,'duplicate webhooks never double-credit a referrer');

    const badCurrency=await req('/api/payments/initialize',{method:'POST',headers:{cookie:buyer.cookie},body:JSON.stringify({plan:'gold'})});
    assert.equal(badCurrency.response.status,200);
    const badTx=providerTx.get(badCurrency.body.reference);
    badTx.verification={reference:badCurrency.body.reference,status:'success',amount:500000,currency:'USD',metadata:badTx.metadata};
    const rejected=await req('/api/payments/verify',{method:'POST',headers:{cookie:buyer.cookie},body:JSON.stringify({reference:badCurrency.body.reference})});
    assert.equal(rejected.response.status,400,'a success in the wrong currency cannot activate a plan');
    let badHook=await webhook({event:'charge.success',data:badTx.verification});
    assert.equal(badHook.status,200);assert.equal((await badHook.json()).processed,false,'mismatched signed metadata/currency is acknowledged but not settled');

    const failedUser=await req('/api/auth/register',{method:'POST',body:JSON.stringify({email:'failed@example.com',password:'password-failed'})});
    const failedInit=await req('/api/payments/initialize',{method:'POST',headers:{cookie:failedUser.cookie},body:JSON.stringify({plan:'gold'})});
    assert.equal(failedInit.response.status,200);
    const failedData={...providerTx.get(failedInit.body.reference),status:'failed'};
    const failedHook=await webhook({event:'charge.failed',data:failedData});
    assert.equal(failedHook.status,200);
    const failedStore=JSON.parse(fs.readFileSync(store,'utf8'));
    assert.equal(failedStore.transactions.find(x=>x.reference===failedInit.body.reference).status,'failed');
    const stillTrial=await req('/api/auth/me',{headers:{cookie:failedUser.cookie}});assert.equal(stillTrial.body.user.status,'trial');

    /* Production must fail closed on Paystack test keys unless an isolated staging
       environment explicitly opts in. */
    const blockedPort=await freePort(),blockedStore=path.join(os.tmpdir(),`kingdom-bible-payments-blocked-${process.pid}.json`);
    const blockedChild=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,NODE_ENV:'production',PORT:String(blockedPort),PREMIUM_STORE_PATH:blockedStore,PAYSTACK_PUBLIC_KEY:PUBLIC_KEY,PAYSTACK_SECRET_KEY:SECRET_KEY,PAYSTACK_ALLOW_TEST_MODE:'',EMAIL_API_KEY:'',EMAIL_FROM:'',AI_API_KEY:''},stdio:['ignore','ignore','pipe']});
    let blockedLogs='';blockedChild.stderr.on('data',b=>blockedLogs+=b);
    const blockedBase='http://127.0.0.1:'+blockedPort;
    try{
      let blockedReady=false;for(let i=0;i<80;i++){try{if((await fetch(blockedBase+'/health')).ok){blockedReady=true;break}}catch{}await delay(50)}
      assert(blockedReady,'production-mode guard test server must start: '+blockedLogs);
      const blockedCfg=await(await fetch(blockedBase+'/api/premium/config')).json();
      assert.equal(blockedCfg.paystackReady,false,'test keys stay disabled on production unless explicitly allowed');
      assert.equal(blockedCfg.paystackPublicKey,'');
      const blockedSignup=await fetch(blockedBase+'/api/auth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'staging@example.com',password:'password-staging'})});
      const blockedCookie=(blockedSignup.headers.get('set-cookie')||'').match(/kb_session=[^;]+/)?.[0]||'';
      const blockedCheckout=await fetch(blockedBase+'/api/payments/initialize',{method:'POST',headers:{'content-type':'application/json',cookie:blockedCookie},body:JSON.stringify({plan:'silver'})});
      assert.equal(blockedCheckout.status,503,'a production install with test keys cannot start checkout');
      assert.match((await blockedCheckout.json()).error,/Paystack test mode is disabled/);
    }finally{blockedChild.kill('SIGTERM');try{fs.unlinkSync(blockedStore)}catch{}}

    const source=fs.readFileSync(path.join(root,'public/premium.js'),'utf8');
    assert(source.includes("q.has('reference')")&&source.includes("q.has('trxref')"),'client resumes verification after returning to root');
    assert(/function afterAuth\(u\)[\s\S]{0,400}verifyPendingPayment\(\)/.test(source),'re-authentication after a checkout redirect resumes verification automatically');
    console.log('✓ Paystack test checkout, authenticated verification, HMAC webhook, currency/metadata checks, referrals, and idempotent settlement');
  }catch(error){console.error(error.stack||error);process.exitCode=1}
  finally{
    child.kill('SIGTERM');provider.close();
    try{fs.unlinkSync(store)}catch{}
  }
})();
