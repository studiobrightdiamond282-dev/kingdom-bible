#!/usr/bin/env node
'use strict';
/**
 * Integration checks for loose reference entry.
 *
 * Two halves:
 *  1. Wiring — app.js and index.html must actually load and use the parser.
 *  2. Behaviour — the exact call chain the app performs, run against the real
 *     shipped Bible data, so "lk 3 23" is proven to reach real verse text.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pub = path.join(root, 'public');
const KBRef = require('../public/ref-parser.js');
const books = require('../public/data/books.json').books;
const index = KBRef.createIndex(books);

console.log('Wiring');
const app = fs.readFileSync(path.join(pub, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(pub, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(pub, 'sw.js'), 'utf8');

const parserPos = html.indexOf('/ref-parser.js');
const appPos = html.indexOf('/app.js');
assert.ok(parserPos > -1, 'index.html must load /ref-parser.js');
assert.ok(appPos > -1, 'index.html must load /app.js');
assert.ok(parserPos < appPos, 'ref-parser.js must load before app.js');
console.log('  ok  index.html loads ref-parser.js before app.js');

assert.ok(app.includes('KBRef.createIndex(books)'), 'app.js must build the parser index');
console.log('  ok  app.js builds the index from books.json');

assert.ok(/function parseRef\(s\)\{if\(!refIndex\)return null;return KBRef\.parse\(/.test(app), 'parseRef must delegate to KBRef');
assert.ok(!app.includes('/^(.+?)\\s+(\\d+)(?::(\\d+)(?:[-–]\\d+)?)?$/'), 'the old exact-match regex must be gone');
console.log('  ok  parseRef delegates to KBRef and the old strict regex is removed');

assert.ok(app.includes('KBRef.looksLikeReference'), 'performSearch must route loose references');
assert.ok(!app.includes('/^.+\\d+:\\d+$/'), 'the old colon-only reference test must be gone');
console.log('  ok  performSearch accepts loose references, not just "3:16" shapes');

assert.ok(app.includes('attachRefSuggest'), 'a live suggestion menu must be wired');
assert.ok(sw.includes('/ref-parser.js'), 'ref-parser.js must be in the service worker shell');
console.log('  ok  suggestion menu wired and parser cached for offline use');

console.log('\nBehaviour against the real shipped Bible data');
// Mirrors getVerse(): parse the reference, then read the chapter file.
const bookCache = new Map();
async function getVerseText(input, tr = 'kjv') {
  const p = KBRef.parse(input, { index, contextBook: state_reader_book });
  if (!p) return null;
  const key = `${tr}:${p.book}`;
  if (!bookCache.has(key)) {
    bookCache.set(key, JSON.parse(fs.readFileSync(path.join(pub, 'data', 'bibles', tr, `${p.book}.json`), 'utf8')));
  }
  const data = bookCache.get(key);
  const chapters = data.chapters[p.chapter - 1] || [];
  let text = chapters[p.verse - 1] || '';
  if (p.verseEnd > p.verse) text = chapters.slice(p.verse - 1, p.verseEnd).filter(Boolean).join(' ');
  return { ...p, text };
}
let state_reader_book = 42; // John, matching DEFAULT state.reader

(async () => {
  const luke = await getVerseText('luk 3 23');
  assert.ok(luke, 'luk 3 23 must resolve');
  assert.strictEqual(luke.label, 'Luke 3:23');
  assert.ok(luke.text && luke.text.length > 10, 'Luke 3:23 must return real text');
  console.log(`  ok  "luk 3 23" -> ${luke.label}: "${luke.text.slice(0, 58)}..."`);

  const john = await getVerseText('jhn 3:16');
  assert.strictEqual(john.label, 'John 3:16');
  assert.ok(/loved/.test(john.text), 'John 3:16 should contain "loved"');
  console.log(`  ok  "jhn 3:16" -> ${john.label}: "${john.text.slice(0, 52)}..."`);

  const firstJohn = await getVerseText('1jhn 3 16');
  assert.strictEqual(firstJohn.label, '1 John 3:16');
  assert.ok(firstJohn.text.length > 10);
  console.log(`  ok  "1jhn 3 16" -> ${firstJohn.label}`);

  const psalms = await getVerseText('ps 23');
  assert.strictEqual(psalms.label, 'Psalms 23:1');
  assert.ok(/shepherd/i.test(psalms.text), 'Psalms 23:1 should mention the shepherd');
  console.log(`  ok  "ps 23" -> ${psalms.label}`);

  const range = await getVerseText('jhn 3:16-18');
  assert.ok(range.text.length > firstJohn.text.length, 'a range must return more text than one verse');
  console.log(`  ok  "jhn 3:16-18" -> ${range.label} (${range.text.length} chars, joined)`);

  // Every book's first chapter must be reachable and non-empty.
  let checked = 0;
  for (let id = 0; id < books.length; id++) {
    const v = await getVerseText(`${books[id].name} 1:1`);
    assert.ok(v && v.book === id, `${books[id].name} 1:1 must resolve to itself`);
    assert.ok(v.text && v.text.length > 3, `${books[id].name} 1:1 returned no text`);
    checked++;
  }
  console.log(`  ok  all ${checked} books return real text for chapter 1 verse 1`);

  // A reference that is not a reference must not hijack a text search.
  assert.strictEqual(KBRef.looksLikeReference('faith', { index, contextBook: 42 }), false);
  assert.strictEqual(KBRef.looksLikeReference('fear not', { index, contextBook: 42 }), false);
  assert.strictEqual(KBRef.looksLikeReference('lk 3 23', { index, contextBook: 42 }), true);
  assert.strictEqual(KBRef.looksLikeReference('rom 8 28', { index, contextBook: 42 }), true);
  assert.strictEqual(KBRef.looksLikeReference('3:16', { index, contextBook: 42 }), true);
  console.log('  ok  text searches ("faith", "fear not") are not hijacked by the reference matcher');

  console.log('\nAll reference integration checks passed.');
})().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
