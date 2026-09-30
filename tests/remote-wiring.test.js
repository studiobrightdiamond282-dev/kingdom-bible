'use strict';
// Wiring check: every element id the remote script touches must exist in the
// remote page, or the controls would silently do nothing on a phone.
const fs = require('fs');
const path = require('path');
const pub = path.join(__dirname, '..', 'public');
const js = fs.readFileSync(path.join(pub, 'remote.js'), 'utf8');
const html = fs.readFileSync(path.join(pub, 'remote.html'), 'utf8');
const css = fs.readFileSync(path.join(pub, 'remote.css'), 'utf8');

const ids = [...new Set([...js.matchAll(/\$\('#([A-Za-z0-9_-]+)'\)/g)].map((m) => m[1]))];
let missing = 0;
console.log('element ids used by remote.js:');
ids.forEach((id) => {
  const ok = html.includes(`id="${id}"`);
  if (!ok) missing++;
  console.log(`  ${ok ? 'ok  ' : 'MISS'} #${id}`);
});
if (missing) throw new Error(`${missing} element id(s) missing from remote.html`);

// The page must load the shared modules, in dependency order.
const order = ['/ref-parser.js', '/live-sync.js', '/remote.js'];
let last = -1;
order.forEach((src) => {
  const at = html.indexOf(src);
  if (at < 0) throw new Error(`remote.html does not load ${src}`);
  if (at < last) throw new Error(`${src} is loaded out of order`);
  last = at;
  console.log(`  ok   loads ${src}`);
});

// No inline scripts: the app's Content-Security-Policy forbids them.
const inlineScript = /<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?\S[\s\S]*?<\/script>/i.test(html);
if (inlineScript) throw new Error('remote.html has an inline <script>, which the CSP would block');
console.log('  ok   no inline scripts (CSP compliant)');

// Every control the page offers must have a handler.
[['nextBtn', 'step(1)'], ['prevBtn', 'step(-1)'], ['blankBtn', 'blankBtn'], ['copyUrlBtn', 'copyUrlBtn'], ['timerToggle', 'toggleTimer']].forEach(([id]) => {
  if (!js.includes(`#${id}`)) throw new Error(`no handler wired for #${id}`);
});
console.log('  ok   NEXT / PREVIOUS / blank / copy / timer all wired');

// Styles referenced by the page must exist.
['.step.next', '.sugg', '.pad', '.toast'].forEach((sel) => {
  if (!css.includes(sel)) throw new Error(`remote.css is missing ${sel}`);
});
console.log('  ok   remote.css defines the pad, suggestions and toast');

console.log('\nRemote wiring checks passed.');
