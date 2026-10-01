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

/* ---- ministry remote + vMix capture ---- */
assert(fs.existsSync(path.join(pub,'remote.html')),'Missing remote.html');
assert(fs.existsSync(path.join(pub,'remote.js')),'Missing remote.js');
assert(fs.existsSync(path.join(pub,'qr.js')),'Missing qr.js');
assert(html.includes('/qr.js'),'index.html must load qr.js');
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
assert.equal(pkg.version,'1.1.0','package.json version');
assert(serverSrc.includes("VERSION='"+pkg.version+"'"),'server.js must report the same version as package.json');
assert(swSrc.includes(`kingdom-bible-v${pkg.version}`),'sw.js cache version must match package.json so updates are picked up');

/* service worker must never serve a cached verse to the live projector */
const sw=fs.readFileSync(path.join(pub,'sw.js'),'utf8');
assert(sw.includes('/present')&&sw.includes('network only'),'service worker must treat /present as network-only');

/* the presenter must not fall back to a code-less, localhost-only display URL */
assert(!/window\.open\('\/present'/.test(app),'presenter must open the LAN display URL with the service code');

console.log('✓ 66 canonical books');console.log('✓ 1,189 chapters');console.log('✓ 31,102 KJV verses');
console.log('✓ KJV, ASV and WEB data available');console.log('✓ Cross references validated');
console.log('✓ PWA shell, manifest and asset links present');
console.log('✓ Ministry remote (QR, pairing, LAN) wired');
console.log('✓ No sensitive-permission requests');
console.log('✓ Version aligned across package, server and service worker');
console.log('All smoke tests passed.');
