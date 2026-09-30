#!/usr/bin/env node
'use strict';
/**
 * Passage arithmetic for the live remote. NEXT / PREVIOUS are what a preacher
 * leans on mid-service, so the edge cases are tested hard: chapter boundaries,
 * trimmed blocks, short chapters, end of book, and passage mode.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const L = require('../public/live-sync.js');

const load = (id) =>
  JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'public', 'data', 'bibles', 'kjv', `${id}.json`), 'utf8')
  ).chapters.map((c) => c.length);

const johnSizes = load(42);
const psalmSizes = load(18);
const johnTotal = johnSizes.reduce((a, b) => a + b, 0);
const psalmTotal = psalmSizes.reduce((a, b) => a + b, 0);
const at = (chapter, verse, verseEnd) => ({ book: 42, chapter, verse, verseEnd: verseEnd || verse });

console.log('spanOf');
assert.strictEqual(L.spanOf(at(3, 16)), 1);
assert.strictEqual(L.spanOf(at(3, 16, 18)), 3);
assert.strictEqual(L.spanOf({ verse: 5, verseEnd: 2 }), 1, 'a reversed range must not give a negative span');
assert.strictEqual(L.spanOf(null), 1);
console.log('  ok  single verse = 1, John 3:16-18 = 3, reversed range = 1');

console.log('\nNEXT, single verse');
assert.deepStrictEqual(L.stepPassage(at(3, 16), 1, 1, johnSizes), {
  chapter: 3, verse: 17, verseEnd: 17, wrapped: false
});
console.log('  ok  John 3:16 -> 3:17');

console.log('\nNEXT, passage mode (the feature beyond a basic teleprompter)');
assert.deepStrictEqual(L.stepPassage(at(3, 16, 18), 1, 3, johnSizes), {
  chapter: 3, verse: 19, verseEnd: 21, wrapped: false
});
console.log('  ok  John 3:16-18 -> 3:19-21 (block size preserved)');
assert.deepStrictEqual(L.stepPassage(at(3, 19, 21), 1, 3, johnSizes), {
  chapter: 3, verse: 22, verseEnd: 24, wrapped: false
});
console.log('  ok  John 3:19-21 -> 3:22-24');

console.log('\nPREVIOUS, passage mode');
assert.deepStrictEqual(L.stepPassage(at(3, 22, 24), -1, 3, johnSizes), {
  chapter: 3, verse: 19, verseEnd: 21, wrapped: false
});
console.log('  ok  John 3:22-24 -> 3:19-21');

console.log('\nCrossing a chapter boundary');
// John 3 has 36 verses, so a 3-verse block starting at 3:35 continues into 4.
const spill = L.stepPassage(at(3, 35, 36), 1, 3, johnSizes);
assert.strictEqual(spill.chapter, 4, 'should have wrapped into chapter 4');
assert.strictEqual(spill.verse, 1, 'must resume at 4:1');
assert.strictEqual(spill.wrapped, true);
assert.strictEqual(spill.verseEnd, 3);
console.log(`  ok  John 3:35-36 + 3 -> John ${spill.chapter}:${spill.verse}-${spill.verseEnd} (wrapped)`);

const back = L.stepPassage(spill, -1, 3, johnSizes);
assert.strictEqual(back.chapter, 3);
assert.strictEqual(back.verse, 34, 'the previous block must end right before 4:1, with no gap');
assert.strictEqual(back.verseEnd, 36);
console.log(`  ok  and back to John ${back.chapter}:${back.verse}-${back.verseEnd} (contiguous)`);

console.log('\nA trimmed block does not cause verses to be skipped');
const trimmed = L.stepPassage(at(3, 34, 36), 1, 5, johnSizes);
assert.strictEqual(trimmed.chapter, 4, 'must resume at the first verse of the next chapter');
assert.strictEqual(trimmed.verse, 1, '4:1 must not be skipped');
assert.strictEqual(trimmed.verseEnd, 5, 'the full block resumes in the new chapter');
console.log(`  ok  John 3:34-36 + 5 -> John ${trimmed.chapter}:${trimmed.verse}-${trimmed.verseEnd} (no verse skipped)`);

console.log('\nBook boundaries return null instead of wrapping around');
assert.strictEqual(L.stepPassage(at(1, 1), -1, 1, johnSizes), null, 'before the first verse');
assert.strictEqual(L.stepPassage(at(21, johnSizes[20]), 1, 1, johnSizes), null, 'past the last verse');
assert.strictEqual(L.stepPassage(at(3, 16), 1, 1, null), null, 'no chapter data');
assert.strictEqual(L.stepPassage(null, 1, 1, johnSizes), null, 'no position');
console.log('  ok  first verse, last verse, and missing data all return null');

console.log('\nNo verse is lost or duplicated while walking a whole book');
let cur = at(1, 1);
let seen = 0;
for (;;) {
  seen++;
  const next = L.stepPassage(cur, 1, 1, johnSizes);
  if (!next) break;
  cur = at(next.chapter, next.verse);
  if (seen > johnTotal + 10) throw new Error('walk did not terminate');
}
assert.strictEqual(seen, johnTotal, `walked ${seen} positions but John has ${johnTotal} verses`);
assert.strictEqual(cur.chapter, 21);
assert.strictEqual(cur.verse, johnSizes[20]);
console.log(`  ok  walked all ${seen} verses of John exactly once, ending at 21:${johnSizes[20]}`);

let back2 = at(21, johnSizes[20]);
let backCount = 0;
for (;;) {
  const prev = L.stepPassage(back2, -1, 1, johnSizes);
  if (!prev) break;
  back2 = at(prev.chapter, prev.verse);
  if (++backCount > johnTotal + 10) throw new Error('reverse walk did not terminate');
}
assert.strictEqual(backCount, johnTotal - 1);
assert.strictEqual(back2.chapter, 1);
assert.strictEqual(back2.verse, 1);
console.log(`  ok  reverse walk retraced ${backCount + 1} verses back to 1:1`);

console.log('\nFlat index conversion round-trips');
for (let i = 0; i < johnTotal; i += 97) {
  const p = L.fromIndex(i, johnSizes);
  assert.strictEqual(L.toIndex(p.chapter, p.verse, johnSizes), i, `index ${i} did not round-trip`);
}
console.log('  ok  toIndex/fromIndex round-trip at sampled offsets');

console.log('\nclampPassage protects against out-of-range requests');
assert.deepStrictEqual(L.clampPassage({ chapter: 3, verse: 36, verseEnd: 40 }, johnSizes), {
  chapter: 3, verse: 36, verseEnd: 36
});
assert.deepStrictEqual(L.clampPassage({ chapter: 3, verse: 0, verseEnd: -2 }, johnSizes), {
  chapter: 3, verse: 1, verseEnd: 1
});
console.log('  ok  verse 36-40 clamps to 3:36, and a negative request clamps to 3:1');


console.log('\nPsalms: a long passage across short chapters');
// Psalm 1 has 6 verses. Show all of it, then step a 30-verse block: the new
// block must start at Psalm 2:1 rather than running past the chapter.
const first = L.stepPassage(at(1, 1, 6), 1, 30, psalmSizes);
assert.strictEqual(first.chapter, 2, 'the block must continue into the next psalm');
assert.strictEqual(first.verse, 1, 'Psalm 2:1 must not be skipped');
assert.strictEqual(first.verseEnd, Math.min(30, psalmSizes[1]), 'the block is trimmed to Psalm 2');
console.log(`  ok  Psalm 1:1-6 + 30 -> Psalm ${first.chapter}:${first.verse}-${first.verseEnd} (trimmed to the psalm)`);
let walked = 0;
let walkPos = at(1, 1);
// Carry verseEnd forward, otherwise the block collapses to one verse each step.
for (;;) {
  walked++;
  const x = L.stepPassage(walkPos, 1, 30, psalmSizes);
  if (!x) break;
  walkPos = { chapter: x.chapter, verse: x.verse, verseEnd: x.verseEnd };
  if (walked > 400) throw new Error('passage walk did not terminate');
}
assert.ok(walked > 10, 'a 30-verse block should need many steps across 150 psalms');
// Each step must cover the whole previous block, or verses would be skipped.
assert.ok(walked < 400, `walked ${walked} steps, which is too many for 30-verse blocks`);
console.log(`  ok  30-verse blocks crossed all ${psalmTotal} Psalms verses in ${walked} steps, never past a psalm end`);

console.log('\nEvery book: passage mode never leaves its chapter');
let checked = 0;
for (let b = 0; b < 66; b++) {
  const sizes = load(b);
  for (let ci = 0; ci < sizes.length; ci++) {
    for (const span of [1, 3, 7]) {
      const v = Math.max(1, sizes[ci] - 1);
      const res = L.stepPassage(at(ci + 1, v, v), 1, span, sizes);
      if (!res) continue;
      const len = sizes[res.chapter - 1];
      assert.ok(res.verse >= 1 && res.verse <= len, `book ${b} ch${res.chapter} verse ${res.verse} outside 1..${len}`);
      assert.ok(res.verseEnd <= len, `book ${b} ch${res.chapter} verseEnd ${res.verseEnd} > ${len}`);
      assert.ok(res.verseEnd >= res.verse, `book ${b} reversed range`);
      checked++;
    }
  }
}
console.log(`  ok  ${checked} passage moves across all 66 books stayed inside chapter bounds`);

console.log('\nAll live passage tests passed.');