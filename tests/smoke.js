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
console.log('✓ 66 canonical books');console.log('✓ 1,189 chapters');console.log('✓ 31,102 KJV verses');console.log('✓ KJV, ASV and WEB data available');console.log('✓ Cross references validated');console.log('✓ PWA shell and routes present');console.log('All smoke tests passed.');
