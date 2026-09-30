'use strict';
// Verifies the deployed Bible data over HTTP, not just on disk.
const assert = require('assert');
const BASE = process.env.KB_BASE || 'https://kingdom-bible-deploy.vercel.app';
const j = async (p) => {
  const r = await fetch(BASE + p);
  assert.strictEqual(r.status, 200, `${p} -> ${r.status}`);
  return r.json();
};
(async () => {
  const books = (await j('/data/books.json')).books;
  const names = books.map((b) => b.name);

  // John 3:16 must read correctly in every shipped translation.
  for (const tr of ['kjv', 'ylt', 'asv', 'web', 'bbe']) {
    const d = await j(`/data/bibles/${tr}/42.json`);
    const v = d.chapters[2][15];
    assert.ok(v && /world/i.test(v), `${tr} John 3:16 looks wrong: ${String(v).slice(0, 70)}`);
    console.log(`  ok  ${tr.toUpperCase().padEnd(4)} John 3:16: ${v.slice(0, 60)}…`);
  }

  // The WEB Romans doxology fix must be live.
  const web = await j('/data/bibles/web/44.json');
  assert.strictEqual(web.chapters[13].length, 23, 'WEB Romans 14 should be 23 verses');
  assert.strictEqual(web.chapters[15].length, 27, 'WEB Romans 16 should be 27 verses');
  assert(/able to establish/i.test(web.chapters[15][24]), 'WEB Romans 16:25 must be the doxology');
  assert(/glory/i.test(web.chapters[15][26]), 'WEB Romans 16:27 must be the doxology ending');
  console.log('  ok  WEB Romans 14 = 23 verses, Romans 16 = 27, doxology in the right place');

  // BBE psalm superscriptions must be gone from verse 1.
  const bbe = await j('/data/bibles/bbe/18.json');
  let leaked = 0;
  bbe.chapters.forEach((c, i) => { if (/^\s*[-–—]?\s*to the chief|^\s*-\s*A Psalm/i.test(c[0])) leaked++; });
  assert.strictEqual(leaked, 0, `${leaked} BBE psalm(s) still start with a superscription`);
  assert(/sheep|shepherd/i.test(bbe.chapters[22][0]), 'BBE Psalm 23:1 text looks wrong');
  console.log('  ok  BBE: no psalm superscription in verse 1; Psalm 23:1 = ' + bbe.chapters[22][0].slice(0, 48) + '…');

  // The parser must be served so the app can use it.
  const r = await fetch(BASE + '/ref-parser.js');
  const src = await r.text();
  assert(/KBRef/.test(src) && /createIndex/.test(src), 'ref-parser.js is not the real parser');
  console.log('  ok  ref-parser.js served correctly for loose reference entry');

  // Loose references must resolve through the live books data.
  const KBRef = require('../public/ref-parser.js');
  const index = KBRef.createIndex(books);
  for (const [input, want] of [['luk 3 23', 'Luke 3:23'], ['jhn 3:16', 'John 3:16'], ['1jhn 3 16', '1 John 3:16'], ['ps 23', 'Psalms 23:1']]) {
    const p = KBRef.parse(input, { index, contextBook: 42 });
    assert.ok(p && p.label === want, `"${input}" -> ${p && p.label} (wanted ${want})`);
    console.log(`  ok  "${input}" -> ${p.label}`);
  }
  console.log(`\nLive verification passed against ${BASE}`);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
