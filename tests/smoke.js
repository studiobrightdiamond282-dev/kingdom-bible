#!/usr/bin/env node
const fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.join(__dirname,'..'),pub=path.join(root,'public');
const sumVerses=books=>books.reduce((n,b)=>n+b.reduce((m,c)=>m+c.length,0),0);
const must=['index.html','styles.css','app.js','sw.js','manifest.json','offline.html','assets/logo.png','data/books.json','data/bible_kjv.json','data/bible_asv.json','data/bible_web.json'];
for(const f of must)assert(fs.existsSync(path.join(pub,f)),`Missing ${f}`);
const books=JSON.parse(fs.readFileSync(path.join(pub,'data/books.json'))).books;
assert.equal(books.length,66);assert.equal(books.reduce((n,b)=>n+b.chapters,0),1189);
for(const tr of ['kjv','asv','web']){const d=JSON.parse(fs.readFileSync(path.join(pub,`data/bible_${tr}.json`)));assert.equal(d.books.length,66);assert.equal(d.books.length,books.length);assert(d.books[42][2][15].length>20,`${tr} John 3:16 missing`);assert(sumVerses(d.books)>=31102,`${tr} canonical verse slots incomplete`)}
const kjv=JSON.parse(fs.readFileSync(path.join(pub,'data/bible_kjv.json')));assert.equal(kjv.books.flat(2).length,31102);assert(kjv.books[0][0][0].startsWith('In the beginning'));
const x=JSON.parse(fs.readFileSync(path.join(pub,'data/xrefs/22.json')));assert(x['Isaiah 53:5']?.some(r=>r.startsWith('1 Peter')));
const html=fs.readFileSync(path.join(pub,'index.html'),'utf8'),app=fs.readFileSync(path.join(pub,'app.js'),'utf8');assert(html.includes('KINGDOM BIBLE'));assert(app.includes('renderBible'));assert(app.includes('renderMinistry'));
const swSrc0=fs.readFileSync(path.join(pub,'sw.js'),'utf8');

/* ---- ministry remote + vMix capture ---- */
assert(fs.existsSync(path.join(pub,'remote.html')),'Missing remote.html');
assert(fs.existsSync(path.join(pub,'remote.js')),'Missing remote.js');
assert(fs.existsSync(path.join(pub,'qr.js')),'Missing qr.js');
assert(fs.existsSync(path.join(pub,'hub-probe.js')),'Missing hub-probe.js');
assert(html.includes('/qr.js'),'index.html must load qr.js');
/* the probe must load before app.js: app.js reads window.KingdomHub on first paint */
assert(html.includes('/hub-probe.js'),'index.html must load hub-probe.js');
assert(html.indexOf('/hub-probe.js')<html.indexOf('/app.js'),'hub-probe.js must load before app.js');
assert(swSrc0.includes('/hub-probe.js'),'the service worker must precache hub-probe.js');
const remote=fs.readFileSync(path.join(pub,'remote.js'),'utf8');
for(const ep of ['/api/session/status','/api/remote/action','/api/verse','/api/stream']){
  assert(remote.includes(ep)||app.includes(ep),`remote flow missing ${ep}`);
}
const css=fs.readFileSync(path.join(pub,'styles.css'),'utf8');
assert(css.includes('user-select:none'),'presentation capture must block text selection');
assert(css.includes('body.presentation-body'),'presentation capture styles missing');
assert(css.includes('transform-origin:center center'),'presentation block needs a transform origin for long-passage scaling');
assert(css.includes('body.presentation-body.is-debug'),'presentation status dot must be opt-in so it never renders into a vMix capture');
assert(css.includes('.remote-body'),'phone remote styles missing');
assert(css.includes('.connect-card'),'presenter connect card styles missing');
assert(app.includes('connectCardHtml')&&app.includes('drawQR'),'presenter QR wiring missing');

/* ---- shared reference engine + Voice Preacher Mode ---- */
assert(fs.existsSync(path.join(pub,'bible-ref.js')),'Missing bible-ref.js (shared reference engine)');
assert(fs.existsSync(path.join(pub,'voice.js')),'Missing voice.js (Voice Preacher Mode)');
assert(fs.existsSync(path.join(pub,'premium.js')),'Missing premium.js (accounts and subscriptions)');
assert(fs.existsSync(path.join(pub,'admin.html'))&&fs.existsSync(path.join(pub,'admin.js')),'Missing admin portal');
assert(fs.existsSync(path.join(pub,'privacy.html'))&&fs.existsSync(path.join(pub,'refund.html')),'Missing legal policy pages');
const serverPremiumSrc=fs.readFileSync(path.join(root,'server.js'),'utf8');
for(const ep of ['/api/auth/register','/api/auth/login','/api/payments/initialize','/api/wallet/withdraw','/api/admin/overview','/api/ai/ask'])assert(serverPremiumSrc.includes(ep),`premium endpoint missing ${ep}`);
assert(serverPremiumSrc.includes('PAYSTACK_SECRET_KEY')&&!serverPremiumSrc.includes('pk_live_15b415df90f55aed4082c964b0fcb61daa642d41'),'live payment credentials must never be hard-coded');
/* Paystack "pass fees to customers" makes the verified amount the GROSS the
   customer paid (Nigeria: 1.5% + NGN 100), so a Silver plan charges 263,960
   kobo instead of 250,000. An exact equality check silently rejected every real
   payment. Guard against that regression coming back. */
assert(!/Number\(d\.data\.amount\)\s*===\s*tx\.amount\s*\*\s*100/.test(serverPremiumSrc),'payment verify must not require Paystack amount to equal the plan price exactly (fees are added when the customer bears them)');
assert(/charged\s*>=\s*tx\.amount\s*\*\s*100/.test(serverPremiumSrc),'payment verify must accept any charged amount at least the plan price so Paystack fees do not break checkout');
/* The hub is exposed to the open internet through a Tailscale Funnel. IP filtering
   cannot protect /admin there (every tunnel request arrives from 127.0.0.1), so the
   portal must be gated on Tailscale's unforgeable identity headers instead. */
assert(serverPremiumSrc.includes('adminGate')&&serverPremiumSrc.includes('tailscale-user-login'),'admin routes must be gated by Tailscale identity headers, not only by password');
assert(/p==='\/admin'/.test(serverPremiumSrc)&&/adminGate\(req\)/.test(serverPremiumSrc),'the /admin page itself must be gated so outsiders cannot load the login form');
assert(serverPremiumSrc.includes('ADMIN_TAILNET_LOGINS'),'ADMIN_TAILNET_LOGINS must be honoured so the owner can be allowlisted');
/* Account reset and deletion. Both are destructive, so both must be reachable only by
   their own explicit HTTP method — a GET that removes an account would be catastrophic
   (a prefetch, a crawler, or a link preview could wipe a paying member). */
assert(/resetUser&&req\.method==='POST'/.test(serverPremiumSrc),'an account reset must require POST');
assert(/deleteUser&&req\.method==='DELETE'/.test(serverPremiumSrc),'account deletion must require DELETE and must never answer a GET');
assert(serverPremiumSrc.includes('dropSessionsFor'),'reset and delete must end the account live sessions, or the change silently does nothing for a signed-in person');
assert(serverPremiumSrc.includes('administrator account cannot be deleted'),'the administrator account must be protected from deletion');
const adminJsSrc=fs.readFileSync(path.join(pub,'admin.js'),'utf8');
assert(/data-deleteuser/.test(adminJsSrc)&&/data-resetuser/.test(adminJsSrc),'the portal must render reset and delete controls on each account');
assert(/Type the email to confirm/.test(adminJsSrc),'deletion must require the operator to type the email, so a stray click cannot remove a paying member');
const premJsSrc=fs.readFileSync(path.join(pub,'premium.js'),'utf8');
assert(/Continue my free trial/.test(premJsSrc),'a trial user must be able to leave the plan screen and keep using the app');
assert(html.includes('/bible-ref.js'),'index.html must load bible-ref.js');
assert(html.includes('/voice.js'),'index.html must load voice.js');
assert(html.includes('/premium.js'),'index.html must load premium.js');
assert(html.indexOf('/bible-ref.js')<html.indexOf('/app.js'),'bible-ref.js must load before app.js');
assert(swSrc0.includes('/bible-ref.js')&&swSrc0.includes('/voice.js')&&swSrc0.includes('/premium.js'),'the service worker must precache the reference, voice, and premium modules');
assert(app.includes('KingdomRef'),'app.js must use the shared reference engine');
assert(app.includes('bindVoice')&&app.includes('getPassage'),'Voice Mode + passage resolution wiring missing');
assert(app.includes('function openManual')&&app.includes('id=\"openManual\"'),'Ministry page must expose the User Manual');
assert(html.includes('data-admin-trigger')&&app.includes("location.href='/admin'"),'admin portal must use the long-hold logo entrance');
assert(app.includes('id=\"profileManual\"')&&app.includes('data-cmanual'),'Profile row and Ctrl+K palette must expose the User Manual');
for(const phrase of ['wrong mic','Voicemeeter','https://','localhost','vMix','OBS','QR'])assert(app.toLowerCase().includes(phrase.toLowerCase()),`User Manual missing ${phrase}`);
const voiceSrc=fs.readFileSync(path.join(pub,'voice.js'),'utf8');
assert(voiceSrc.includes('FUSE_MS=350')&&voiceSrc.includes('CHAPTER_HOLD_MS=1100'),'Voice Scripture lock fuse timings missing');
assert(voiceSrc.includes('dispatchKeys')&&voiceSrc.includes('dispatchKeys.add(key)'),'Voice dedupe key must lock at dispatch time');
const serverSrc1=fs.readFileSync(path.join(root,'server.js'),'utf8');
assert(serverSrc1.includes("require('./public/bible-ref.js')"),'server.js must use the shared reference engine');
/* Voice Preacher Mode needs the microphone for THIS origin only */
assert(serverSrc1.includes('microphone=(self)'),'server.js must allow microphone for Voice Preacher Mode');
const vercelCfg=fs.readFileSync(path.join(root,'vercel.json'),'utf8');
assert(vercelCfg.includes('microphone=(self)'),'vercel.json must allow microphone for Voice Preacher Mode');

/* Play Store sensitive-permission guard: no Notification.requestPermission anywhere */
for(const f of ['app.js','remote.js','sw.js']){
  const src=fs.readFileSync(path.join(pub,f),'utf8');
  assert(!/Notification\s*\.\s*requestPermission/.test(src),`${f} must not request notification permission (Play Store sensitive-permission warning)`);
}
assert(fs.existsSync(path.join(pub,'.well-known/assetlinks.json')),'Digital Asset Links missing (required for Play Store TWA verification)');
/* a placeholder fingerprint silently fails Play verification, so it must not ship */
const al=JSON.parse(fs.readFileSync(path.join(pub,'.well-known/assetlinks.json'),'utf8'));
assert(!/REPLACE_WITH|TODO|YOUR_/.test(JSON.stringify(al)),'assetlinks.json still contains a placeholder fingerprint');
assert(fs.existsSync(path.join(root,'scripts/assetlinks.js')),'run "npm run assetlinks -- <keystore>" to generate the release fingerprint');
assert(fs.existsSync(path.join(pub,'.well-known/assetlinks.json')),'assetlinks.json must be served');
const mf=JSON.parse(fs.readFileSync(path.join(pub,'manifest.json'),'utf8'));
assert(mf.icons.some(i=>i.purpose==='maskable'),'manifest needs a maskable icon');
assert(mf.icons.some(i=>i.sizes==='512x512'),'manifest needs a 512x512 icon');
assert(mf.name&&mf.short_name&&mf.start_url&&mf.display,'manifest is incomplete');

/* version must not drift between the package, the service worker and the server */
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const swSrc=fs.readFileSync(path.join(pub,'sw.js'),'utf8');
const serverSrc=fs.readFileSync(path.join(root,'server.js'),'utf8');
assert.equal(pkg.version,'1.2.1','package.json version');
assert(serverSrc.includes("VERSION='"+pkg.version+"'"),'server.js must report the same version as package.json');
assert(swSrc.includes(`kingdom-bible-v${pkg.version}`),'sw.js cache version must match package.json so updates are picked up');

/* service worker must never serve a cached verse to the live projector */
const sw=fs.readFileSync(path.join(pub,'sw.js'),'utf8');
assert(sw.includes('/present')&&sw.includes('network only'),'service worker must treat /present as network-only');

/* the presenter must not fall back to a code-less, localhost-only display URL */
assert(!/window\.open\('\/present'/.test(app),'presenter must open the LAN display URL with the service code');

/* ---- guest access: essential Bible reading must never be behind an account ----
   A signed-out visitor used to get a full-screen gate that replaced #main, so no
   Bible, no service worker, no install prompt and no offline support. */
assert(!/function showSignInGate/.test(app),'the full-screen sign-in gate must not replace the application for signed-out readers');
assert(!/showSignInGate\(\)/.test(app),'nothing may re-open the gate, including the sign-out path');
const initSrc=app.slice(app.indexOf('async function init()'),app.indexOf('function renderNav()'));
assert(!/if\(!accountState\.signedIn\)\{[^}]*return/.test(initSrc),'init() must not return early for a signed-out visitor');
assert(/loadHub|navigate\(/.test(initSrc),'init() must still navigate for every visitor');
/* Removing the reading gate must NOT have removed the guards on other people's data. */
assert(/if\(!accountState\.signedIn\)\{box\.innerHTML='[\s\S]{0,200}?Sign in to see your referral earnings/.test(app),'the referral wallet must stay hidden from signed-out visitors');
assert(/registerPWA\(\); networkStatus\(\);/.test(app),'the service worker and network status must be set up for guests too');
assert(/clearSignInGate\(\);\s*[\r\n]+\s*paintTrialBanner\(\);/.test(app),'init() must tear the gate down and paint the banner for every visitor');
assert(/s\.status==='signed_out'/.test(app),'the banner must have a signed-out state, not only trial/expired');
assert(/data-open-auth="register"/.test(app)&&/data-open-auth="login"/.test(app),'the guest banner must offer both create-account and sign-in');
assert(/openAuth/.test(app),'the guest banner buttons must open the form they promise, via openAuth');
assert(/body\.gate-open[^{]*\.quick-fab\{display:none!important\}/.test(css),'the floating quick-action button must never sit on top of a full-screen gate');

/* ---- Google sign-in must actually be reachable under the CSP ---- */
assert(/function openAuth\(mode\)/.test(premJsSrc),'premium.js must offer a direct sign-in/sign-up entry point');
assert(/g\.KingdomPremium=\{open,openAuth/.test(premJsSrc),'openAuth must be exported on window.KingdomPremium');
assert(/function openAuth\(mode\)\{load\(\)\.then\(\(\)=>user\?account\(\):auth\(/.test(premJsSrc),'openAuth must land on the register/login form, not the generic plan screen');
for(const [name,src] of [['server.js',serverSrc1],['vercel.json',vercelCfg]]){
  assert(/script-src[^;]*https:\/\/accounts\.google\.com/.test(src),`${name} CSP must allow the Google Identity Services script`);
  assert(/connect-src[^;]*https:\/\/accounts\.google\.com/.test(src),`${name} CSP must allow Google sign-in network calls`);
  assert(/frame-src[^;]*https:\/\/accounts\.google\.com/.test(src),`${name} CSP must allow the Google sign-in popup frame`);
  assert(/style-src[^;]*https:\/\/accounts\.gstatic\.com/.test(src),`${name} CSP must allow Google's button stylesheet`);
}

/* ---- home: the personal dashboard, not a marketing explainer ---- */
assert(app.includes('async function renderHome()'),'renderHome must still be defined');
assert(app.includes('function renderMinistry()'),'Ministry Mode must still be defined');
assert(app.includes('KingdomPremium?.open()')&&app.includes('KingdomPremium?.supportText?.()'),'Premium upgrade + WhatsApp support must stay wired from home');
/* The explainer landing page replaced this screen once and was removed again on
   the owner's instruction. Pin its absence so it cannot silently come back:
   the home screen must stay the reader's own dashboard, not a product pitch. */
for(const dead of ['kbx-home','kbx-hero','KBX_PILLARS','KBX_DEMOS','KINGDOM BIBLE EXPLAINER HOME','bindHomeWalkthrough','initHomeReveal'])
  assert(!app.includes(dead),`the removed explainer home must not return: ${dead}`);
assert(!css.includes('kbx-'),'the explainer home CSS must not return');
assert(!app.includes('READ THE WORD.')&&!app.includes('START READING'),'home must not be the explainer hero copy');
for(const id of ['resumeTop','resumeReading','homeUpgrade','homeWhatsApp','dailySave','dailyShare','dailyOpen','memoryStart'])
  assert(app.includes(`id="${id}"`),`home must keep #${id}`);
/* Every panel the dashboard is built from, so it cannot be gutted to a stub. */
for(const c of ['welcome-row','home-membership','daily-grid','verse-card','today-stack','continue-card','devotional-card','home-stats','stat-card','quick-grid','quick-card','section-head'])
  assert(app.includes(c),`home markup must include .${c}`);
for(const c of ['.welcome-row','.daily-grid','.verse-card','.continue-card','.devotional-card','.home-stats','.stat-card','.quick-grid','.quick-card','.home-membership'])
  assert(css.includes(c),`styles.css must still define ${c}`);
for(const s of ['Good ${','VERSE OF THE DAY','CONTINUE READING','TODAY’S DEVOTIONAL','Today with God','Quick actions','Your next step','day reading streak','chapters read','verses saved','prayer entries'])
  assert(app.includes(s),`home is missing the dashboard copy "${s}"`);
/* The dashboard must read its verse from the Bible data and greet the signed-in
   reader by name; a hardcoded verse here would quietly go stale or be wrong. */
const homeBlock=app.slice(app.indexOf('async function renderHome()'),app.indexOf('/* BIBLE READER */'));
assert(homeBlock.includes('getVerse(dr)'),'the verse of the day must be resolved from the Bible data');
assert(homeBlock.includes('displayName()'),'home must greet the signed-in reader by name');
assert(/Thy word is a lamp/.test(homeBlock)===false,'home must not hardcode Bible text');
assert(/book-mark/.test(homeBlock),'the continue-reading card must show the book initial');
assert(app.includes("const NAV=[['home'"),'Home must remain the first navigation entry');
assert(app.includes("navigate('home')")||app.includes("'home'"),'sign-in must still land on Home');

console.log('✓ 66 canonical books');console.log('✓ 1,189 chapters');console.log('✓ 31,102 KJV verses');
console.log('✓ KJV, ASV and WEB data available');console.log('✓ Cross references validated');
console.log('✓ PWA shell, manifest and asset links present');
console.log('✓ Ministry remote (QR, pairing, LAN) wired');
console.log('✓ Shared reference engine + Voice Preacher Mode wired');
console.log('✓ No sensitive-permission requests');
console.log('✓ Version aligned across package, server and service worker');
console.log('All smoke tests passed.');
