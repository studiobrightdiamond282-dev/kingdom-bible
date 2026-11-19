#!/usr/bin/env node
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const result = spawnSync(process.execPath, [path.join(root, 'scripts/build-static.js')], { cwd: root, encoding: 'utf8' });
assert.strictEqual(result.status, 0, `static build failed:\n${result.stdout}\n${result.stderr}`);

for (const name of ['privacy.html', 'refund.html']) {
  const page = fs.readFileSync(path.join(dist, name), 'utf8');
  assert(!/\{\{WHATSAPP(?:_LINK|_BILLING)?\}\}/.test(page), `${name} has no unresolved WhatsApp placeholders`);
  assert(page.includes('https://wa.me/2348134438808?text='), `${name} has a usable WhatsApp support link`);
  assert(page.includes('+234 813 443 8808'), `${name} displays the shared support number`);
}
const admin = fs.readFileSync(path.join(dist, 'admin.html'), 'utf8');
assert(admin.includes('https://kingdom-bible.onrender.com/?admin=1'), 'static /admin points at the live gated portal');
assert(!/<form\b|admin\.js|admin-portal\.html/.test(admin), 'static /admin does not expose a nonfunctional admin login form');
assert(!fs.existsSync(path.join(dist, 'admin-portal.html')) && !fs.existsSync(path.join(dist, 'admin.js')),
  'the private admin shell and script are excluded from static output');
assert(fs.existsSync(path.join(dist, 'index.html')) && fs.existsSync(path.join(dist, 'sw.js')),
  'the app shell and service worker are in the static output');
assert(fs.existsSync(path.join(dist, 'analytics.js')) && fs.existsSync(path.join(dist, 'privacy-analytics.js')),
  'anonymous analytics and the privacy opt-out are included in the Vercel static build');
for (const asset of ['kingdom-bible-product-preview.jpg', 'kingdom-bible-product-preview.mp4']) {
  const built = path.join(dist, 'assets', asset);
  assert(fs.existsSync(built), `static build includes ${asset}`);
  assert.strictEqual(fs.statSync(built).size, fs.statSync(path.join(root, 'public', 'assets', asset)).size,
    `static build preserves the complete ${asset} asset`);
}

const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
assert.strictEqual(vercel.buildCommand, 'node scripts/build-static.js');
assert.strictEqual(vercel.outputDirectory, 'dist');
const route = path => vercel.rewrites.find(x => x.source === path)?.destination;
assert.strictEqual(route('/admin'), '/admin.html');
assert.strictEqual(route('/privacy'), '/privacy.html');
assert.strictEqual(route('/refund'), '/refund.html');
console.log('✓ Vercel static build renders legal contacts and sends /admin to the live gated portal');
