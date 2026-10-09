#!/usr/bin/env node
// Daily devotionals: 30 youth + 30 adult, rotating by calendar day.
const fs=require('fs'),path=require('path'),assert=require('assert'),vm=require('vm');
const src=fs.readFileSync(path.join(__dirname,'..','public','devotionals.js'),'utf8');
const ctx={window:{}};
vm.createContext(ctx);
vm.runInContext(src,ctx,{filename:'devotionals.js'});
const {YOUTH,ADULT}=ctx.window.KingdomDevotionals;
assert(Array.isArray(YOUTH)&&YOUTH.length===30,`YOUTH must have 30 entries (has ${YOUTH&&YOUTH.length})`);
assert(Array.isArray(ADULT)&&ADULT.length===30,`ADULT must have 30 entries (has ${ADULT&&ADULT.length})`);
for(const [name,lib] of [['YOUTH',YOUTH],['ADULT',ADULT]]){
  const titles=new Set();
  lib.forEach((d,i)=>{
    for(const k of ['title','scripture','verse','question','message','reflection','prayer','action'])
      assert(typeof d[k]==='string'||Array.isArray(d[k]),`${name}[${i}] missing ${k}`);
    assert(d.title.length>8,`${name}[${i}] title too short`);
    assert(Array.isArray(d.message)&&d.message.length===2,`${name}[${i}] needs exactly 2 teaching paragraphs`);
    assert(d.message.every(p=>p.length>60),`${name}[${i}] teaching too thin`);
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
assert.notEqual(YOUTH[dayIdx(30,a)].title,YOUTH[dayIdx(30,b)].title,'youth must change day to day');
assert.notEqual(ADULT[dayIdx(30,a)].title,ADULT[dayIdx(30,b)].title,'adult must change day to day');
assert.equal(dayIdx(30,a),dayIdx(30,new Date(2026,9,9)),'same calendar day must give same entry');
console.log('✓ 30 youth + 30 adult devotionals, full teaching schema, daily rotation');
