'use strict';
// Verifies the deployed live remote: assets are served, and a verse published
// the way the phone remote publishes is readable by the audience display.
const assert = require('assert');
const BASE = process.env.KB_BASE || 'https://kingdom-bible-deploy.vercel.app';

const KBRef = require('../public/ref-parser.js');
const L = require('../public/live-sync.js');
const books = require('../public/data/books.json').books;
const index = KBRef.createIndex(books);

const get = async (p) => {
  const r = await fetch(BASE + p);
  assert.strictEqual(r.status, 200, `${p} -> ${r.status}`);
  return r;
};
const j = async (p) => (await get(p)).json();

(async () => {
  // Every asset the remote page needs must be live.
  for (const p of ['/remote', '/remote.js', '/remote.css', '/live-sync.js', '/ref-parser.js']) {
    const r = await get(p);
    const body = await r.text();
    assert.ok(body.length > 100, `${p} looks empty`);
  }
  console.log('  ok  remote page, script, styles and shared modules all served');

  // The remote page must not contain an inline script (the CSP would block it).
  const html = await (await get('/remote')).text();
  assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>\s*\S/i.test(html), 'remote page has an inline script');
  assert.ok(html.includes('NEXT VERSE'), 'remote page is missing the NEXT button');
  assert.ok(html.includes('id="nextBtn"'), 'remote page is missing #nextBtn');
  assert.ok(html.includes('id="prevBtn"'), 'remote page is missing #prevBtn');
  console.log('  ok  remote page has NEXT / PREVIOUS controls and no inline scripts');

  // Loose reference entry resolves against the live books data.
  const remoteBooks = (await j('/data/books.json')).books;
  const liveIndex = KBRef.createIndex(remoteBooks);
  const typed = KBRef.parse('luk 3 23', { index: liveIndex, contextBook: 42 });
  assert.strictEqual(typed.label, 'Luke 3:23');
  console.log('  ok  "luk 3 23" resolves to Luke 3:23 on the deployed books data');

  const tr = 'kjv';
  const data = await j(`/data/bibles/${tr}/${typed.book}.json`);
  const sizes = data.chapters.map((c) => c.length);
  const clamped = L.clampPassage(typed, sizes);
  const chapters = data.chapters[clamped.chapter - 1] || [];
  const text = chapters.slice(clamped.verse - 1, clamped.verseEnd).filter(Boolean).join(' ');
  assert.ok(/thirty/i.test(text), 'Luke 3:23 text should be served correctly');

  // Publish exactly as the phone remote does.
  const post = await fetch(`${BASE}/api/presentation`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      text,
      ref: 'Luke 3:23',
      translation: tr,
      theme: 'royal',
      church: 'LIVE TEST CHURCH'
    })
  });
  assert.strictEqual(post.status, 200, `POST /api/presentation -> ${post.status}`);
  console.log('  ok  remote published Luke 3:23 to the live endpoint');

  // The display reads it back.
  const shown = await j('/api/presentation');
  assert.strictEqual(shown.ref, 'Luke 3:23');
  assert.strictEqual(shown.church, 'LIVE TEST CHURCH');
  console.log('  ok  display reads back the published verse');

  // NEXT VERSE with block size 1.
  const cur = { book: typed.book, chapter: clamped.chapter, verse: clamped.verse, verseEnd: clamped.verseEnd };
  const next = L.stepPassage(cur, 1, 1, sizes);
  assert.strictEqual(next.verse, 24);
  // Passage mode with block size 3.
  const block = { book: typed.book, chapter: 3, verse: 16, verseEnd: 18 };
  const stepped = L.stepPassage(block, 1, 3, sizes);
  assert.deepStrictEqual([stepped.verse, stepped.verseEnd], [19, 21]);
  console.log('  ok  NEXT VERSE and passage mode (3:16-18 -> 3:19-21) work on live data');

  // Clean up so the display is not left showing test data.
  await fetch(`${BASE}/api/presentation`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...shown, blank: true })
  });
  console.log('  ok  display blanked after the check');

  console.log(`\nLive remote verification passed against ${BASE}`);
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
