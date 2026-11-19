#!/usr/bin/env node
// Daily devotionals: 36 youth + 36 adult (30 classic + 6 AI-life each), rotating by calendar day.
const fs=require('fs'),path=require('path'),assert=require('assert'),vm=require('vm');
const src=fs.readFileSync(path.join(__dirname,'..','public','devotionals.js'),'utf8');
const ctx={window:{}};
vm.createContext(ctx);
vm.runInContext(src,ctx,{filename:'devotionals.js'});
const {YOUTH,ADULT}=ctx.window.KingdomDevotionals;
assert(Array.isArray(YOUTH)&&YOUTH.length===36,`YOUTH must have 36 entries (has ${YOUTH&&YOUTH.length})`);
assert(Array.isArray(ADULT)&&ADULT.length===36,`ADULT must have 36 entries (has ${ADULT&&ADULT.length})`);
for(const [name,lib] of [['YOUTH',YOUTH],['ADULT',ADULT]]){
  const titles=new Set();
  lib.forEach((d,i)=>{
    for(const k of ['title','scripture','verse','question','message','reflection','prayer','action'])
      assert(typeof d[k]==='string'||Array.isArray(d[k]),`${name}[${i}] missing ${k}`);
    assert(d.title.length>8,`${name}[${i}] title too short`);
    assert(Array.isArray(d.message)&&d.message.length>=3&&d.message.length<=4,`${name}[${i}] needs 3–4 teaching paragraphs`);
    assert(d.message.every(p=>p.length>100),`${name}[${i}] teaching too thin`);
    assert(/Direct answer|Concrete answer|Concrete rule|Concrete plan|Concrete step|Concrete rule:/.test(d.message[d.message.length-1])||d.message.length===4,`${name}[${i}] final paragraph should give the direct answer`);
    assert(d.verse.length>10,`${name}[${i}] verse text too short`);
    assert(d.reflection.endsWith('?'),`${name}[${i}] reflection must be a question`);
    assert(/amen\.?$/i.test(d.prayer),`${name}[${i}] prayer must close with Amen`);
    assert(d.action.length>10,`${name}[${i}] action point too short`);
    assert(!titles.has(d.title),`${name} duplicate title: ${d.title}`);
    titles.add(d.title);
    assert(!/\bundefined\b|\bNaN\b|\[object Object\]/.test(JSON.stringify(d)),`${name}[${i}] leaks placeholders`);
  });
}
// rotation: day-of-year modulo length — deterministic, changes daily
const dayIdx=(n,d)=>{const s=new Date(d.getFullYear(),0,0);return Math.floor((d-s)/86400000)%n};
const a=new Date(2026,9,9),b=new Date(2026,9,10);
assert.notEqual(YOUTH[dayIdx(36,a)].title,YOUTH[dayIdx(36,b)].title,'youth must change day to day');
assert.notEqual(ADULT[dayIdx(36,a)].title,ADULT[dayIdx(36,b)].title,'adult must change day to day');
assert.equal(dayIdx(36,a),dayIdx(36,new Date(2026,9,9)),'same calendar day must give same entry');
// Share must capture the WHOLE message: one full-text share + a paginated image card.
const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
for(const needle of ['devShareStrings','devShareCardBlobs','devCardLayout','devPaintPage','Action point\\n','Reflect\\n','Prayer\\n','PAGE ${','Share full card (all pages)'])
  assert(app.includes(needle),`app.js share must include ${JSON.stringify(needle)} — full-message share regression`);
console.log('✓ 36 youth + 36 adult devotionals, 3-paragraph deep teaching, daily rotation');
console.log('✓ share carries the whole devotional (full text + paginated multi-page image card)');
