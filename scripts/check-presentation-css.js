'use strict';
// Inspects the presentation CSS to reason about OBS/vMix browser-source
// rendering without needing a browser.
const fs = require('fs');
const path = require('path');
const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');

const find = (sel) => {
  // Plain substring search for "selector{" rather than a regex, because the
  // selectors here contain dots that are easier to match literally.
  const i = css.indexOf(sel + '{');
  if (i < 0) {
    // allow a grouped selector like "html.is-transparent,body.is-transparent{"
    const grouped = sel.split(',').map((s) => s.trim() + '{');
    for (const g of grouped) {
      if (css.includes(g)) return '(grouped selector present)';
    }
    return null;
  }
  return css.slice(i + sel.length + 1, css.indexOf('}', i)).trim();
};

const bodyRule = find('body.presentation-body');
const stageTransparent = find('.presentation-stage.transparent');
const htmlTransparent = find('html.is-transparent');

console.log('body.presentation-body =>', bodyRule);
console.log('.presentation-stage.transparent =>', stageTransparent);
console.log('html.is-transparent =>', htmlTransparent || '(MISSING)');

const bodyBg = bodyRule && (bodyRule.match(/background:\s*([^;]+)/) || [])[1];
const groupOk = /html\.is-transparent\s*,\s*body\.is-transparent\{background:transparent/.test(css);
const legible = /\.presentation-stage\.transparent blockquote\{[^}]*text-shadow/.test(css);

const problems = [];
// A browser source only renders a transparent page when the page itself is
// transparent. Clearing just the inner stage leaves the body painting an
// opaque rectangle underneath, which OBS would composite as a black box.
if (!groupOk) problems.push('no rule makes html and body transparent for the transparent theme');
if (!legible) problems.push('transparent theme has no text shadow, so the verse is unreadable over video');
// The JS must toggle the class, otherwise the CSS never applies.
const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
if (!/is-transparent/.test(app)) problems.push('app.js never toggles the is-transparent class');
if (!/th==='transparent'/.test(app)) problems.push('app.js does not detect the transparent theme');

if (problems.length) {
  console.log('\nPROBLEMS:');
  problems.forEach((p) => console.log('  - ' + p));
  process.exit(1);
}
console.log('\nOBS overlay contract satisfied:');
console.log('  - the transparent theme clears html and body, not just the stage');
console.log('  - text keeps a shadow so it stays readable over live video');
console.log('  - app.js toggles the class when the theme is transparent');
console.log(`  - stage background for transparent: ${stageTransparent}`);
