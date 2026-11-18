#!/usr/bin/env node
'use strict';
/* Self-service reset email tests are isolated behind a local fake Resend endpoint. */
const assert=require('assert');
const {spawn}=require('child_process');
const fs=require('fs');
const http=require('http');
const os=require('os');
const path=require('path');
const root=path.join(__dirname,'..');
const store=path.join(os.tmpdir(),`kingdom-bible-reset-email-${process.pid}.json`);
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const json=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(data))};
async function listen(server){await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return server.address().port}
async function freePort(){const s=http.createServer();const p=await listen(s);await new Promise(resolve=>s.close(resolve));return p}
async function readBody(req){const chunks=[];for await(const chunk of req)chunks.push(chunk);return Buffer.concat(chunks).toString('utf8')}
async function waitForMail(delivered){for(let i=0;i<40&&!delivered.length;i++)await delay(25);assert(delivered.length,'configured reset email was not delivered')}

(async()=>{
  const delivered=[];
  const emailServer=http.createServer(async(req,res)=>{
    const raw=await readBody(req);
    if(req.method!=='POST'||req.url!=='/emails'||req.headers.authorization!=='Bearer test-resend-key')return json(res,401,{error:'bad request'});
    await delay(500);delivered.push(JSON.parse(raw));return json(res,200,{id:'email_'+delivered.length});
  });
  const emailPort=await listen(emailServer),port=await freePort();
  const child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,NODE_ENV:'test',PORT:String(port),ADMIN_PASSWORD:'test-admin-password',PREMIUM_STORE_PATH:store,PAYSTACK_PUBLIC_KEY:'',PAYSTACK_SECRET_KEY:'',EMAIL_API_KEY:'test-resend-key',EMAIL_FROM:'KINGDOM BIBLE <no-reply@example.test>',EMAIL_API_URL:`http://127.0.0.1:${emailPort}/emails`,AI_API_KEY:''},stdio:['ignore','pipe','pipe']});
  let logs='';child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
  const base='http://127.0.0.1:'+port;
  async function request(url,options={}){
    const response=await fetch(base+url,{...options,headers:{'content-type':'application/json',...(options.headers||{})}});
    const body=await response.json().catch(()=>({}));
    const cookie=(response.headers.getSetCookie?.()[0]||response.headers.get('set-cookie')||'').match(/kb_session=[^;]+/)?.[0]||'';
    return{response,body,cookie};
  }
  async function ready(){for(let i=0;i<80;i++){try{const r=await fetch(base+'/health');if(r.ok)return}catch{}await delay(50)}throw Error('reset-email test server did not start: '+logs)}
  try{
    await ready();
    const config=await request('/api/premium/config');assert.equal(config.body.passwordResetEmailEnabled,true);
    const signup=await request('/api/auth/register',{method:'POST',body:JSON.stringify({email:'member@example.com',password:'old-password',name:'Member'})});
    assert.equal(signup.response.status,201);
    const started=Date.now();
    const known=await request('/api/auth/password/forgot',{method:'POST',body:JSON.stringify({email:'member@example.com'})});
    const elapsed=Date.now()-started;
    const unknown=await request('/api/auth/password/forgot',{method:'POST',body:JSON.stringify({email:'nobody@example.com'})});
    assert.equal(known.response.status,202);assert.equal(unknown.response.status,202);
    assert.equal(known.body.message,unknown.body.message,'unknown and registered addresses receive the same public response');
    assert.equal(known.body.passwordResetEmailEnabled,true);
    assert(elapsed<450,'recovery response must not wait for slow mail delivery (timing can reveal registered addresses)');
    await waitForMail(delivered);
    assert.equal(delivered.length,1,'one recovery email should be sent for the existing account');
    const mail=delivered[0];
    assert.deepEqual(mail.to,['member@example.com']);assert.match(mail.from,/KINGDOM BIBLE/);
    assert.equal(mail.subject,'Your KINGDOM BIBLE password reset code');
    const code=(mail.text.match(/reset code is (\d{6})/)||[])[1];assert(code,'email contains the six-digit code');
    assert(!JSON.stringify(known.body).includes(code),'the HTTP response never exposes the recovery code');
    assert.equal(delivered.length,1,'unknown accounts must not receive mail');

    const repeated=await request('/api/auth/password/forgot',{method:'POST',body:JSON.stringify({email:'member@example.com'})});
    assert.equal(repeated.body.message,known.body.message);assert.equal(delivered.length,1,'resend throttle prevents rapid mail spam');
    let reset=await request('/api/auth/password/reset',{method:'POST',body:JSON.stringify({email:'member@example.com',code:'000000',newPassword:'new-password'})});
    if(code==='000000')reset=await request('/api/auth/password/reset',{method:'POST',body:JSON.stringify({email:'member@example.com',code:'999999',newPassword:'new-password'})});
    assert.equal(reset.response.status,400,'a guessed code must not reset the password');
    reset=await request('/api/auth/password/reset',{method:'POST',body:JSON.stringify({email:'member@example.com',code,newPassword:'new-password'})});
    assert.equal(reset.response.status,200,reset.body.error);
    assert.equal((await request('/api/auth/login',{method:'POST',body:JSON.stringify({email:'member@example.com',password:'old-password'})})).response.status,401);
    assert.equal((await request('/api/auth/login',{method:'POST',body:JSON.stringify({email:'member@example.com',password:'new-password'})})).response.status,200);
    assert.equal((await request('/api/auth/password/reset',{method:'POST',body:JSON.stringify({email:'member@example.com',code,newPassword:'third-password'})})).response.status,400,'reset codes are single-use');
    const persisted=JSON.stringify(JSON.parse(fs.readFileSync(store,'utf8')));
    assert(!persisted.includes(code),'recovery code is hashed in the account store');
    console.log('✓ Email recovery sends one-time codes through the configured provider, throttles resends, avoids enumeration, and changes the password');
  }catch(error){console.error(error.stack||error);process.exitCode=1}
  finally{child.kill('SIGTERM');emailServer.close();try{fs.unlinkSync(store)}catch{}}
})();
