#!/usr/bin/env node
'use strict';
/**
 * The glass guide must actually cover what someone needs to get a service on
 * screen, and the OBS/vMix contract must be real rather than aspirational.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const pub = path.join(__dirname, '..', 'public');
const guide = require('../public/guide.js');
const app = fs.readFileSync(path.join(pub, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(pub, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(pub, 'styles.css'), 'utf8');

const ids = guide.TABS.map((t) => t.id);
console.log('Guide sections:', guide.TABS.map((t) => `${t.id} (${t.label})`).join(', '));
assert.ok(guide.TABS.length >= 4, 'guide needs at least 4 sections');
['start', 'vmix', 'obs', 'phone', 'keys'].forEach((id) => {
  assert.ok(ids.includes(id), `guide is missing the ${id} section`);
});
console.log('  ok  covers quick start, vMix, OBS, phone remote and shortcuts');

console.log('\nEvery section has real content');
guide.TABS.forEach((t) => {
  assert.ok(t.label && t.title, `${t.id} needs a label and title`);
  assert.ok(t.html.length > 400, `${t.id} content looks too thin (${t.html.length} chars)`);
  const open = (t.html.match(/<ol/g) || []).length;
  const close = (t.html.match(/<\/ol>/g) || []).length;
  assert.strictEqual(open, close, `${t.id} has unbalanced <ol>`);
});
console.log('  ok  all sections have substantial, well-formed content');

console.log('\nvMix guidance names the things a volunteer must actually click');
const vmix = guide.TABS.find((t) => t.id === 'vmix').html;
['Add Input', 'Web Browser', '1920', '1080'].forEach((needle) => {
  assert.ok(vmix.includes(needle), `vMix guide is missing "${needle}"`);
});
// vMix has no alpha channel, so telling people to use Transparent there would
// produce an opaque box.
assert.ok(/only in OBS/.test(vmix), 'vMix guide should redirect transparent users to OBS');
console.log('  ok  vMix: Add Input → Web Browser, 1920×1080, and alpha steered to OBS');

console.log('\nOBS guidance is specific enough to follow without guessing');
const obs = guide.TABS.find((t) => t.id === 'obs').html;
['Browser', '1920', '1080', 'Shutdown source when not visible', 'Transparent', 'FPS'].forEach((needle) => {
  assert.ok(obs.includes(needle), `OBS guide is missing "${needle}"`);
});
console.log('  ok  OBS: Browser source, 1920×1080, shutdown-source warning, FPS, transparent theme');

console.log('\nThe OBS transparency contract actually holds in the shipped CSS');
// A browser source only composites as transparent when the page itself is
// transparent. Clearing only the inner stage leaves body painting an opaque box.
assert.ok(
  /html\.is-transparent\s*,\s*body\.is-transparent\{background:transparent!important\}/.test(css),
  'html and body must both be cleared for a real transparent overlay'
);
assert.ok(/th==='transparent'/.test(app), 'app.js must detect the transparent theme');
assert.ok(/documentElement\.classList\.toggle\('is-transparent'/.test(app), 'app.js must toggle the class');
assert.ok(/\.presentation-stage\.transparent blockquote\{[^}]*text-shadow/.test(css), 'overlay text needs a shadow to be readable over video');
console.log('  ok  page clears html+body, app toggles the class, overlay text stays legible');

console.log('\nThe guide is reachable and wired');
['guideBtn', 'guideOverlay', 'guideSearch', 'guideTabs', 'guideBody', 'guideClose'].forEach((id) => {
  assert.ok(html.includes(`id="${id}"`), `index.html is missing #${id}`);
  assert.ok(app.includes(`#${id}`), `app.js never references #${id}`);
});
assert.ok(html.includes('/guide.js'), 'index.html must load guide.js');
assert.ok(app.includes('bindGuide()'), 'init must call bindGuide()');
// The guide must load before app.js calls it.
assert.ok(html.indexOf('/guide.js') < html.indexOf('/app.js'), 'guide.js must load before app.js');
// The Ministry Mode vMix / OBS buttons should route into the glass guide,
// on the matching tab rather than the old inline modal.
const openGuideFn = (app.match(/function openGuide\(type\)\{[^}]*\}/) || [''])[0];
assert.ok(openGuideFn, 'openGuide handler not found');
assert.ok(/openGuidePopup\(/.test(openGuideFn), 'openGuide must delegate to the glass guide');
assert.ok(/'vmix'/.test(openGuideFn), 'openGuide must route to the vMix tab');
assert.ok(/'obs'/.test(openGuideFn), 'openGuide must route to the OBS tab');
assert.ok(!/modal\(/.test(openGuideFn), 'openGuide should no longer build the old inline modal');
console.log('  ok  button, overlay, search, tabs all present; guide.js loads first');
console.log('  ok  the vMix and OBS buttons open the glass guide on the right tab');

console.log('\nFrosted-glass styling is real, not just a class name');
assert.ok(/-webkit-backdrop-filter:blur\(\d+px\)/.test(css), 'needs -webkit-backdrop-filter for Safari');
assert.ok(/(?<!-)backdrop-filter:blur\(\d+px\)/.test(css), 'needs standard backdrop-filter');
assert.ok(/prefers-reduced-motion/.test(css), 'the popup animation must respect reduced-motion');
assert.ok(/@media\(max-width:580px\)/.test(css), 'the popup must adapt to a phone screen');
console.log('  ok  blur, gradient, reduced-motion and mobile layout all present');

console.log('\nSearch can filter across the guide');
const entries = guide.searchable();
assert.strictEqual(entries.length, guide.TABS.length);
entries.forEach((e) => {
  // `raw` is the human-readable text, `text` is the punctuation-stripped form
  // used for matching. Substance is judged on the readable form, because the
  // Shortcuts section is mostly key caps and strips down to much less.
  assert.ok(e.raw.length > 300, `${e.id} has too little readable text (${e.raw.length})`);
  assert.ok(e.text.length > 200, `${e.id} has no searchable text (${e.text.length})`);
  assert.ok(!/[<>]/.test(e.text), `${e.id} searchable text still contains markup`);
  assert.ok(!/\s/.test(e.text), `${e.id} normalized text should have no whitespace`);
});
// Words a volunteer would actually type mid-setup. Search normalizes
// punctuation, so "wifi" must still find "Wi-Fi" and "1920x1080" must find
// "1920 × 1080" — otherwise the search feels broken at the worst moment.
['transparent', 'fps', '1920', 'next verse', 'wifi', 'wi-fi', '1920x1080', 'browser'].forEach((q) => {
  const hits = guide.filter(q);
  assert.ok(hits.length > 0, `searching "${q}" would return nothing`);
});
console.log('  ok  "transparent", "fps", "1920", "next verse", "wifi", "1920x1080" all find something');
assert.strictEqual(guide.filter('   ').length, guide.TABS.length, 'a blank query should show everything');
assert.strictEqual(guide.filter('zzzzznotathing').length, 0, 'a nonsense query should show nothing');
console.log('  ok  blank query shows all sections, nonsense query shows none');

console.log('\nGlass guide checks passed.');
