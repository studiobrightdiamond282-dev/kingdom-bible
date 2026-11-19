#!/usr/bin/env node
const fs=require('fs'),path=require('path'),assert=require('assert'),vm=require('vm');
const root=path.join(__dirname,'..'),pub=path.join(root,'public');
const html=fs.readFileSync(path.join(pub,'index.html'),'utf8');
const app=fs.readFileSync(path.join(pub,'app.js'),'utf8');
const sw=fs.readFileSync(path.join(pub,'sw.js'),'utf8');
const css=fs.readFileSync(path.join(pub,'demo-tour.css'),'utf8');
const source=fs.readFileSync(path.join(pub,'demo-tour.js'),'utf8');

assert(html.includes('/demo-tour.css'),'the demo styles must be loaded by the app shell');
assert(html.includes('/demo-tour.js'),'the guided demo must be loaded by the app shell');
assert(html.indexOf('/demo-tour.js')<html.indexOf('/app.js'),'the demo controller must load before app.js');
assert(sw.includes("'/demo-tour.css'")&&sw.includes("'/demo-tour.js'"),'the guided demo must be available in the PWA shell cache');
assert(app.includes('id="playDemo"')&&app.includes('window.KingdomDemo?.open'),'the home page must launch the guided demo');
assert(css.includes('.demo-pointer-path')&&css.includes('.demo-target-ring'),'the tour must show a clear arrow and spotlight target');
assert(css.includes('prefers-reduced-motion:reduce'),'the tour must respect reduced-motion preferences');
assert(source.includes('aria-modal="true"')&&source.includes('aria-live="polite"'),'the tour dialog and changing captions must be accessible');

const sandbox={window:{},document:{}};
vm.runInNewContext(source,sandbox,{filename:'demo-tour.js'});
const demo=sandbox.window.KingdomDemo;
assert(demo&&typeof demo.open==='function'&&typeof demo.close==='function','guided demo API must initialize');
assert.equal(demo.steps.length,7,'the one-minute tour should cover seven short product steps');
const ids=demo.steps.map(step=>step.id);
assert.equal(new Set(ids).size,ids.length,'tour step ids must be unique');
for(const step of demo.steps){
  assert(step.feature&&step.title&&step.description&&step.action,`incomplete demo copy for ${step.id}`);
  assert(['bible','search','study','plans','prayer','ministry'].includes(step.route),`unknown route for ${step.id}`);
  assert(step.pointer&&step.pointer.label,`missing arrow caption for ${step.id}`);
  for(const point of [step.pointer.from,step.pointer.control,step.pointer.target]){
    assert(Array.isArray(point)&&point.length===2,`invalid pointer coordinates for ${step.id}`);
    assert(point[0]>=0&&point[0]<=1000&&point[1]>=0&&point[1]<=560,`pointer outside demo frame for ${step.id}`);
  }
  assert(step.pointer.labelX>=0&&step.pointer.labelX<=100,`arrow caption X outside demo frame for ${step.id}`);
  assert(step.pointer.labelY>=0&&step.pointer.labelY<=100,`arrow caption Y outside demo frame for ${step.id}`);
}
assert(demo.steps.some(step=>step.id==='reader')&&demo.steps.some(step=>step.id==='ministry'),'tour must cover Bible reading and ministry presentation');
assert(!/localStorage|fetch\s*\(/.test(source),'tour previews must not read personal data or make network requests');
console.log('✓ Home guided demo is wired and cached for offline use');
console.log('✓ Seven accessible feature steps include valid arrow targets and routes');
console.log('✓ Demo screens remain isolated from personal data and network services');
