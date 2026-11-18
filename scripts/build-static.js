#!/usr/bin/env node
'use strict';
/* Build the Vercel static site from the shared public source.
   Legal pages need a real phone/link at build time because static hosting cannot
   perform server-side template replacement. The private admin login shell is
   intentionally omitted; /admin.html is a static handoff to the gated live hub. */
const fs = require('fs');
const path = require('path');
const { SUPPORT_PHONE, SUPPORT_PHONE_DISPLAY, supportLink } = require('../config/site.js');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'public');
const output = path.join(root, 'dist');
const privateAdminFiles = new Set([path.join(source, 'admin-portal.html'), path.join(source, 'admin.js')]);

if (!fs.existsSync(source)) throw new Error('public/ directory is missing');
fs.rmSync(output, { recursive: true, force: true });
fs.cpSync(source, output, {
  recursive: true,
  filter: file => !privateAdminFiles.has(path.resolve(file))
});

const substitutions = {
  '{{WHATSAPP}}': SUPPORT_PHONE_DISPLAY,
  '{{WHATSAPP_LINK}}': supportLink('Hello KINGDOM BIBLE support'),
  '{{WHATSAPP_BILLING}}': supportLink('Billing help for KINGDOM BIBLE')
};
for (const name of ['privacy.html', 'refund.html']) {
  const file = path.join(output, name);
  let html = fs.readFileSync(file, 'utf8');
  for (const [placeholder, value] of Object.entries(substitutions)) {
    const escaped = value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    html = html.replaceAll(placeholder, escaped);
  }
  if (/\{\{WHATSAPP(?:_LINK|_BILLING)?\}\}/.test(html)) {
    throw new Error(`${name} still has an unresolved WhatsApp placeholder`);
  }
  fs.writeFileSync(file, html);
}

const admin = fs.readFileSync(path.join(output, 'admin.html'), 'utf8');
if (!admin.includes('https://kingdom-bible.onrender.com/?admin=1') || /<form\b|admin\.js/.test(admin)) {
  throw new Error('The static admin route must hand off to the live gated portal, not expose a login form');
}
if (fs.existsSync(path.join(output, 'admin-portal.html')) || fs.existsSync(path.join(output, 'admin.js'))) {
  throw new Error('The private admin portal shell and script must not be part of the static output');
}
console.log(`Built static site in ${path.relative(root, output)} (support ${SUPPORT_PHONE})`);
