#!/usr/bin/env node
'use strict';
/**
 * Reference parser tests, run against the real public/data/books.json so the
 * matcher is verified against the same 66 books the app ships.
 */
const assert = require('assert');
const path = require('path');
const KBRef = require('../public/ref-parser.js');

const books = require('../public/data/books.json').books;
const index = KBRef.createIndex(books);
const ctx = 42; // John, for bare "3:16"

let passed = 0;
function check(input, expected, note) {
  const r = KBRef.parse(input, { index, contextBook: ctx });
  assert.ok(r, `expected "${input}" to parse`);
  const label = r.label;
  assert.strictEqual(label, expected, `"${input}" -> ${label} (expected ${expected})`);
  if (note) console.log(`  ok  ${input.padEnd(16)} -> ${label}${note ? '   ' + note : ''}`);
  passed++;
}

console.log('Exact and shorthand forms');
check('lk 3 23', 'Luke 3:23', 'the reported case');
check('luk 3 23', 'Luke 3:23', 'no colon');
check('luke 3:23', 'Luke 3:23');
check('Luke 3:23', 'Luke 3:23');
check('LUKE 3:23', 'Luke 3:23', 'case insensitive');
check('luk3:23', 'Luke 3:23', 'no spaces at all');
check('luke3.23', 'Luke 3:23', 'dot separator');
check('luke 3 23', 'Luke 3:23');
check('Lk 3,23', 'Luke 3:23', 'comma separator');
check('luke/3/23', 'Luke 3:23', 'slash separator');

console.log('\nAbbreviations and typos');
check('jhn 3:16', 'John 3:16', 'edit distance');
check('jn 3:16', 'John 3:16');
check('joh 3:16', 'John 3:16');
check('john 3', 'John 3:1', 'chapter only');
check('mt 5:3', 'Matthew 5:3');
check('matt 6:33', 'Matthew 6:33');
check('mk 1:1', 'Mark 1:1');
check('ps 23:1', 'Psalms 23:1', 'Psalms is plural in the UI');
check('psalm 23:1', 'Psalms 23:1');
check('pr 3:5', 'Proverbs 3:5');
check('rev 22:21', 'Revelation 22:21');
check('rom 8:28', 'Romans 8:28');
check('phil 4:6', 'Philippians 4:6');
check('song 1:1', 'Song of Solomon 1:1');
check('songofsolomon 2:1', 'Song of Solomon 2:1');
check('ezek 33:1', 'Ezekiel 33:1');
check('zeph 3:5', 'Zephaniah 3:5');
check('hab 2:4', 'Habakkuk 2:4');

console.log('\nNumbered books');
check('1 jhn 3:16', '1 John 3:16');
check('1john 3:16', '1 John 3:16', 'glued ordinal');
check('1jn 3:16', '1 John 3:16');
check('2 jn 1:1', '2 John 1:1');
check('3 jn 1:2', '3 John 1:2');
check('1 sam 1:1', '1 Samuel 1:1');
check('1sam 16:13', '1 Samuel 16:13');
check('2 tim 1:1', '2 Timothy 1:1');
check('1 cor 13:4', '1 Corinthians 13:4');
check('2 thess 1:1', '2 Thessalonians 1:1');
check('1 pet 1:1', '1 Peter 1:1');
check('sam 16:13', '1 Samuel 16:13', 'ordinal dropped');
check('kgs 1:1', '1 Kings 1:1', 'ambiguous 1/2, first wins');

console.log('\nRanges and bare chapter:verse');
check('jn 3:16-18', 'John 3:16-18');
check('jn 3:16–18', 'John 3:16-18', 'en dash');
check('jhn 1:1-2:2', 'John 1:1-2', 'range end only used when present');
assert.strictEqual(KBRef.parse('jn 3:16-18', { index }).verseEnd, 18);
check('3:16', 'John 3:16', 'context book used');
check('5', 'John 5:1', 'chapter only with context');

console.log('\nRejections (must not silently guess)');
for (const bad of ['', '   ', 'faith', 'john', 'zzzz 3:1', '3:16-', 'lk 0:0', 'lk 3:0']) {
  const r = KBRef.parse(bad, { index, contextBook: bad === '3:16' ? ctx : undefined });
  assert.ok(!r || (r.chapter > 0 && r.verse > 0), `"${bad}" should not resolve to junk, got ${JSON.stringify(r)}`);
}
console.log('  ok  blank, word-only, unknown, and zero inputs rejected');

// A bare "3:16" with no context book must fail rather than guess.
assert.strictEqual(KBRef.parse('3:16', { index }), null);
console.log('  ok  bare "3:16" without a context book is rejected');

console.log('\nAmbiguity is reported, not guessed');
// "jud" is a declared alias of BOTH Judges and Jude, so it is a real tie.
const jud = KBRef.parse('jud 1:1', { index });
assert.ok(jud, '"jud" should still resolve to something');
assert.strictEqual(jud.bookName, 'Judges', 'more-read book wins the tie');
assert.strictEqual(jud.confidence, false, 'a tie must not be treated as confident');
const names = jud.candidates.map((id) => books[id].name);
assert.ok(names.includes('Jude'), 'Jude must be offered as an alternative');
console.log(`  ok  "jud 1:1" -> top ${jud.label}, alternatives: ${names.join(', ')}`);

// An exact shared alias must surface in the dropdown even when routing is clear.
const alt = KBRef.suggest('jud 1:1', { index });
assert.ok(alt.some((s) => s.label === 'Jude 1:1'), 'dropdown should offer Jude too');
console.log(`  ok  suggest("jud 1:1") -> ${alt.map((s) => s.label).join(', ')}`);

const shortKey = KBRef.parse('j 1:1', { index });
assert.ok(!shortKey || shortKey.confidence === false, 'a single letter must not resolve confidently');
console.log('  ok  single-letter "j" is not treated as a confident match');

// Popular books must win genuine ties so common typing stays predictable.
assert.strictEqual(KBRef.parse('jhn 3:16', { index }).bookName, 'John', 'jhn is a typo, not an alias');
assert.strictEqual(KBRef.parse('phil 1:1', { index }).bookName, 'Philippians');
assert.strictEqual(KBRef.parse('pet 1:1', { index }).bookName, '1 Peter');
assert.strictEqual(KBRef.parse('kgs 1:1', { index }).bookName, '1 Kings');
console.log('  ok  "jhn" -> John, "phil" -> Philippians, "pet" -> 1 Peter, "kgs" -> 1 Kings');

// An exact alias always beats a fuzzy match, even for a rarer book: "jon" is a
// declared abbreviation of Jonah, so Jonah wins even though John is far more read.
assert.strictEqual(KBRef.parse('jon 1:1', { index }).bookName, 'Jonah', 'exact alias beats popularity');
console.log('  ok  "jon" -> Jonah, because it is an exact declared alias, not a guess');

console.log('\nRanges expose verseEnd');
const range = KBRef.parse('ps 23:1-6', { index });
assert.strictEqual(range.verse, 1);
assert.strictEqual(range.verseEnd, 6);
assert.strictEqual(range.label, 'Psalms 23:1-6');
console.log('  ok  ps 23:1-6 -> verse 1 through 6');

console.log('\nSuggestions feed the dropdown');
const sug = KBRef.suggest('luk 3', { index });
assert.ok(sug.length >= 1, 'expected at least one suggestion');
assert.strictEqual(sug[0].label, 'Luke 3:1');
console.log(`  ok  suggest("luk 3") -> ${sug.map((s) => s.label).join(', ')}`);

console.log('\nFull 66-book sweep (name, abbr, first alias x 3 formats)');
let swept = 0;
books.forEach((b, id) => {
  const keys = [b.name, b.abbr, (b.aliases || [])[0]].filter(Boolean);
  keys.forEach((k) => {
    [k + ' 3:2', k + '3.2', k.toLowerCase() + '3 2'].forEach((input) => {
      const r = KBRef.parse(input, { index });
      assert.ok(r, `no match for "${input}"`);
      assert.strictEqual(r.chapter, 3, `"${input}" wrong chapter`);
      assert.strictEqual(r.verse, 2, `"${input}" wrong verse`);
      swept++;
    });
  });
  // every book must be reachable by its own full name
  const self = KBRef.parse(`${b.name} 1:1`, { index });
  assert.ok(self, `full name failed for ${b.name}`);
  assert.strictEqual(self.book, id, `${b.name} resolved to ${self.bookName}`);
});
console.log(`  ok  ${swept} formatted inputs + 66 full-name lookups all correct`);

console.log(`\nAll ${passed} reference checks passed.`);
