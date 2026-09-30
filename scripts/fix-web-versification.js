#!/usr/bin/env node
'use strict';
/**
 * Repair the World English Bible so its verse numbering matches the KJV scheme
 * the rest of the app depends on.
 *
 * The problem (found by the verse-alignment assertion in tests/smoke.js):
 * WEB follows the older Western text, which places Paul's doxology at the end
 * of ROMANS 14 rather than the end of ROMANS 16. That made WEB ship with:
 *   - Romans 14 = 26 verses (3 too many)
 *   - Romans 16 = 25 verses, the last of them EMPTY
 * So "Romans 16:25" rendered as an empty verse, and every Romans 14 reference
 * was off after verse 23.
 *
 * The fix moves the three doxology verses to where KJV puts them, matching ASV,
 * YLT, BBE and the TSK cross-reference dataset. Only the position changes; the
 * WEB wording is untouched.
 *
 * The script validates before and after and writes nothing unless the result
 * matches the KJV shape exactly.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'public', 'data');
const key = 'web';
const ROMANS = 44; // book index
const CH14 = 13; // Romans chapter 14 -> index 13
const CH16 = 15; // Romans chapter 16 -> index 15
const DOXOLOGY = 3; // KJV Romans 16:25-27

const kjv = JSON.parse(fs.readFileSync(path.join(DATA, 'bible_kjv.json'), 'utf8')).books;
const file = path.join(DATA, `bible_${key}.json`);
const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
const books = doc.books;

console.log('Before:');
console.log(`  Romans 14 = ${books[ROMANS][CH14].length} verses (KJV ${kjv[ROMANS][CH14].length})`);
console.log(`  Romans 16 = ${books[ROMANS][CH16].length} verses (KJV ${kjv[ROMANS][CH16].length})`);

const before14 = books[ROMANS][CH14];
const ch16 = books[ROMANS][CH16];

// 1. The doxology currently sits at the tail of Romans 14.
const doxology = before14.splice(before14.length - DOXOLOGY, DOXOLOGY);
if (doxology.length !== DOXOLOGY) throw new Error('could not lift the doxology out of Romans 14');
console.log('\nLifted from Romans 14:');
doxology.forEach((v, i) => console.log(`  was 14:${before14.length + 1 + i}: ${v.slice(0, 62)}…`));

// 2. WEB Romans 16 ends with an empty padding verse; drop it before appending.
let dropped = '';
if (ch16.length && !String(ch16[ch16.length - 1]).trim()) {
  dropped = ch16.pop();
  console.log('\nDropped empty trailing verse from Romans 16 (was verse 25)');
}

// 3. Re-attach the doxology where KJV has it.
doxology.forEach((v, i) => ch16.push(v));
console.log('\nRe-attached to Romans 16:');
doxology.forEach((v, i) => console.log(`  now 16:${ch16.length - DOXOLOGY + 1 + i}: ${v.slice(0, 62)}…`));

// 4. Validate before writing anything.
const shape = kjv.map((b) => b.map((c) => c.length).join(','));
const actual = books.map((b) => b.map((c) => c.length).join(','));
if (actual.join(';') !== shape.join(';')) {
  const names = require(path.join(DATA, 'books.json')).books.map((b) => b.name);
  for (let b = 0; b < 66; b++) {
    if (actual[b] !== shape[b]) console.log(`  still misaligned: ${names[b]}`);
  }
  throw new Error('WEB is still not verse-aligned to KJV; nothing was written');
}

// Blank slots must equal the documented textual gaps: the four verses WEB omits
// (they are absent from its underlying text). Romans 16:25 is no longer one of
// them, because the doxology now fills it.
const names = require(path.join(DATA, 'books.json')).books.map((b) => b.name);
const gaps = require('./textual-gaps').checkGaps(key, books, names);
if (!gaps.ok) {
  if (gaps.unexpected.length) throw new Error(`unexpected empty verse(s): ${gaps.unexpected.join(', ')} — nothing written`);
  if (gaps.missing.length) throw new Error(`expected but missing empty verse(s): ${gaps.missing.join(', ')} — nothing written`);
}
console.log('\nAfter:');
console.log(`  Romans 14 = ${books[ROMANS][CH14].length} verses`);
console.log(`  Romans 16 = ${books[ROMANS][CH16].length} verses`);
console.log('  all 66 books now match the KJV shape');
console.log(`  ${gaps.actual.length} documented textual gaps: ${gaps.actual.join(', ') || 'none'}`);

// 5. Write the monolithic file and every per-book reader file.
doc.books = books;
fs.writeFileSync(file, JSON.stringify(doc));
const dir = path.join(DATA, 'bibles', key);
books.forEach((chapters, bi) => {
  fs.writeFileSync(
    path.join(dir, `${bi}.json`),
    JSON.stringify({ translation: key, book: bi, name: names[bi], chapters })
  );
});
console.log(`  rewrote bible_${key}.json and 66 per-book files`);
