#!/usr/bin/env node
const fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.join(__dirname,'..'),pub=path.join(root,'public');
const sumVerses=books=>books.reduce((n,b)=>n+b.reduce((m,c)=>m+c.length,0),0);
// Every translation the app offers. Kept in one place so a new one cannot be
// half-registered: the TR map in app.js and these files must agree.
const TRANSLATIONS=['kjv','ylt','asv','web','bbe'];
const must=['index.html','styles.css','app.js','sw.js','ref-parser.js','live-sync.js','guide.js','manifest.json','offline.html','assets/logo.png','data/books.json',...TRANSLATIONS.map(t=>`data/bible_${t}.json`)];
for(const f of must)assert(fs.existsSync(path.join(pub,f)),`Missing ${f}`);
const books=JSON.parse(fs.readFileSync(path.join(pub,'data/books.json'))).books;
assert.equal(books.length,66);assert.equal(books.reduce((n,b)=>n+b.chapters,0),1189);
const kjv=JSON.parse(fs.readFileSync(path.join(pub,'data/bible_kjv.json')));
const shape=kjv.books.map(b=>b.map(c=>c.length).join(','));
for(const tr of TRANSLATIONS){
  const d=JSON.parse(fs.readFileSync(path.join(pub,`data/bible_${tr}.json`)));
  assert.equal(d.books.length,66,`${tr} book count`);assert.equal(d.books.length,books.length);
  assert(d.books[42][2][15].length>20,`${tr} John 3:16 missing`);
  assert(sumVerses(d.books)>=31102,`${tr} canonical verse slots incomplete`);
  // Verses are addressed positionally, so every translation must match the KJV
  // shape exactly or a reference would resolve to the wrong text.
  assert.equal(d.books.map(b=>b.map(c=>c.length).join(',')).join(';'),shape.join(';'),`${tr} is not verse-aligned to KJV`);
  // Per-book reader files and metadata must exist for every book.
  for(let i=0;i<66;i++)assert(fs.existsSync(path.join(pub,`data/bibles/${tr}/${i}.json`)),`${tr} missing book file ${i}`);
  assert(fs.existsSync(path.join(pub,`data/bibles/${tr}/meta.json`)),`${tr} missing meta.json`);
  // Blank verse slots must equal the documented textual gaps exactly: a known
  // gap (Matthew 17:21 in ASV) is legitimate, a stray one is a misalignment.
  const gaps=require('../scripts/textual-gaps').checkGaps(tr,d.books,books.map(b=>b.name));
  assert(gaps.ok,`${tr} textual gaps differ — unexpected: [${gaps.unexpected}] missing: [${gaps.missing}]`);
  // No psalm superscription may leak into verse 1.
  d.books[18].forEach((c,i)=>assert(!/^\s*[-–—]?\s*to the chief/i.test(c[0]),`${tr} Psalms ${i+1}:1 is a superscription`));
}
assert.equal(kjv.books.flat(2).length,31102);assert(kjv.books[0][0][0].startsWith('In the beginning'));
const x=JSON.parse(fs.readFileSync(path.join(pub,'data/xrefs/22.json')));assert(x['Isaiah 53:5']?.some(r=>r.startsWith('1 Peter')));
const html=fs.readFileSync(path.join(pub,'index.html'),'utf8'),app=fs.readFileSync(path.join(pub,'app.js'),'utf8');assert(html.includes('KINGDOM BIBLE'));assert(app.includes('renderBible'));assert(app.includes('renderMinistry'));
// Every offered translation must be registered in the app's TR map.
for(const tr of TRANSLATIONS)assert(app.includes(`${tr}:`),`${tr} is not registered in TR`);
console.log('✓ 66 canonical books');console.log('✓ 1,189 chapters');console.log('✓ 31,102 KJV verses');console.log(`✓ ${TRANSLATIONS.length} translations available and verse-aligned: ${TRANSLATIONS.join(', ').toUpperCase()}`);console.log('✓ Cross references validated');console.log('✓ PWA shell and routes present');console.log('All smoke tests passed.');
