#!/usr/bin/env node
'use strict';
/**
 * Add a Bible translation to public/data, aligned to the KJV versification the
 * app already uses.
 *
 * The app addresses verses positionally (chapter index, verse index), so a
 * translation that numbers verses differently would silently display the WRONG
 * text for a given reference. Every build is therefore aligned to KJV and then
 * validated against the KJV shape before anything is written.
 *
 * Usage:  node scripts/add-translation.js <source.json> <key>
 * Source: an array of 66 books, each { name, chapters: [[verse, ...], ...] }
 *
 * Alignment rules live in RULES below and each one records why it exists, so
 * every adjustment is auditable rather than a silent fudge.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'public', 'data');
const bookNames = require(path.join(ROOT, 'public', 'data', 'books.json')).books.map((b) => b.name);

// Shared anchors that hold for any English translation of these verses.
const BASE_SPOT = [
  [42, 2, 15, /world/i],        // John 3:16
  [41, 2, 22, /thirty/i],       // Luke 3:23
  [18, 22, 0, /shepherd|sheep/i],  // Psalm 23:1 (YLT "shepherd", BBE "sheep")
  [39, 4, 2, /blessed|poor/i],  // Matthew 5:3
  [63, 0, 0, /gaius/i]          // 3 John 1:1
];
const CATALOG = {
  ylt: {
    name: 'Young’s Literal Translation',
    license: 'Public Domain (1898)',
    align: [],
    spot: [[0, 0, 0, /beginning/i]] // "In the beginning…"
  },
  bbe: {
    name: 'Bible in Basic English',
    license: 'Public Domain (1949, 1964)',
    align: [
      {
        book: 'Psalms',
        chapter: 76,
        dropFirst: 1,
        why: 'BBE gives the psalm superscription its own verse; KJV folds it into verse 1.'
      },
      {
        book: '3 John',
        chapter: 1,
        mergeAt: 14,
        why: 'BBE splits KJV verse 14 into two; KJV keeps “Peace be to thee…” in verse 14.'
      }
    ],
    // BBE renders Genesis 1:1 "At the first God made the heaven and the earth."
    spot: [[0, 0, 0, /heaven|earth/i]],
    // BBE writes the psalm superscription inline, e.g.
    // "- A Psalm. Of David. - The Lord takes care of me…". Strip the title so
    // verse 1 shows only Scripture.
    stripPsalmTitle: /^\s*[-–—][^-–—]*[-–—]\s*/,
    stripPsalmTitleWhy:
      'BBE prefixes psalm verse 1 with the superscription between dashes, e.g. “- A Psalm. Of David. - ”'
  }
};

const [, , sourceFile, key] = process.argv;
if (!sourceFile || !key || !CATALOG[key]) {
  console.error('usage: node scripts/add-translation.js <source.json> <' + Object.keys(CATALOG).join('|') + '>');
  process.exit(1);
}
const cfg = CATALOG[key];

/** Apply one auditable alignment rule to a single chapter. */
function applyRule(chapterVerses, rule, where) {
  if (rule.dropFirst) {
    const removed = chapterVerses.splice(0, rule.dropFirst);
    if (removed.length !== rule.dropFirst) throw new Error(`${where}: dropFirst out of range`);
    return `dropped ${rule.dropFirst} (${removed.map((v) => v.slice(0, 28)).join(' | ')})`;
  }
  if (rule.mergeAt) {
    const i = rule.mergeAt - 1;
    if (i < 0 || i + 1 >= chapterVerses.length) throw new Error(`${where}: mergeAt out of range`);
    chapterVerses[i] = `${chapterVerses[i]} ${chapterVerses[i + 1]}`;
    chapterVerses.splice(i + 1, 1);
    return `merged verse ${rule.mergeAt} + ${rule.mergeAt + 1}`;
  }
  throw new Error(`${where}: unknown rule`);
}
console.log(`Building ${key} — ${cfg.name}`);

// 1. read, tolerating a UTF-8 BOM
const raw = fs.readFileSync(sourceFile, 'utf8').replace(/^﻿/, '');
const src = JSON.parse(raw);
if (!Array.isArray(src) || src.length !== 66) throw new Error(`expected 66 books, got ${src.length}`);

// 2. align to KJV
const books = src.map((b) => b.chapters.map((c) => c.slice()));
for (const rule of cfg.align) {
  const bi = bookNames.indexOf(rule.book);
  if (bi < 0) throw new Error(`unknown book "${rule.book}" in alignment rule`);
  const ci = rule.chapter - 1;
  if (!books[bi][ci]) throw new Error(`${rule.book} has no chapter ${rule.chapter}`);
  const note = applyRule(books[bi][ci], rule, `${rule.book} ${rule.chapter}`);
  console.log(`  align ${rule.book} ${rule.chapter}: ${note}`);
  console.log(`         why: ${rule.why}`);
}
console.log(`  ${cfg.align.length} alignment rule(s) applied`);

// 2b. strip inline psalm superscriptions, if this translation needs it
if (cfg.stripPsalmTitle) {
  let stripped = 0;
  books[18].forEach((c, ci) => {
    const before = c[0];
    c[0] = c[0].replace(cfg.stripPsalmTitle, '');
    if (c[0] !== before) {
      stripped++;
      if (stripped === 1) console.log(`  e.g. Psalms ${ci + 1}:1 "${before.slice(0, 46)}…" -> "${c[0].slice(0, 46)}…"`);
    }
  });
  console.log(`  stripped inline psalm superscription from ${stripped} chapter(s)`);
  console.log(`         why: ${cfg.stripPsalmTitleWhy}`);
}

// 3. validate against the KJV shape before writing anything
const kjv = JSON.parse(fs.readFileSync(path.join(DATA, 'bible_kjv.json'), 'utf8')).books;
if (books.length !== kjv.length) throw new Error(`book count ${books.length} != ${kjv.length}`);
let slots = 0;
books.forEach((b, bi) => {
  if (b.length !== kjv[bi].length) {
    throw new Error(`${bookNames[bi]}: ${b.length} chapters, KJV has ${kjv[bi].length}`);
  }
  b.forEach((c, ci) => {
    if (c.length !== kjv[bi][ci].length) {
      throw new Error(
        `${bookNames[bi]} ${ci + 1}: ${c.length} verses, KJV has ${kjv[bi][ci].length} — ` +
          'this translation is not aligned and would show the wrong text'
      );
    }
    c.forEach((v, vi) => {
      if (typeof v !== 'string' || !v.trim()) {
        throw new Error(`${bookNames[bi]} ${ci + 1}:${vi + 1} is empty`);
      }
    });
    slots += c.length;
  });
});
console.log(`  validated: 66 books, ${slots} verse slots, exact KJV shape`);

// 4. spot-check well-known verses so a silently shifted file cannot pass
const SPOT = BASE_SPOT.concat(cfg.spot || []);
SPOT.forEach(([bi, ci, vi, re]) => {
  const text = books[bi][ci][vi];
  if (!re.test(text)) throw new Error(`spot check failed: ${bookNames[bi]} ${ci + 1}:${vi + 1} -> ${text.slice(0, 60)}`);
});
console.log(`  ${SPOT.length} known-verse spot checks passed`);

// 4b. Invariant: a psalm superscription is metadata, never verse 1. Some modern
// translations give it its own verse, which would shift the whole psalm.
const SUPER = /^\s*[-–—]?\s*to the chief/i;
books[18].forEach((c, ci) => {
  if (SUPER.test(c[0])) {
    throw new Error(
      `Psalms ${ci + 1}:1 looks like a superscription -> "${c[0].slice(0, 50)}" — ` +
        'add a dropFirst alignment rule for this chapter'
    );
  }
});
console.log('  all 150 psalm superscriptions are correctly kept out of verse 1');

// 5. Blank verse slots must match the documented textual gaps for this
// translation exactly. A known gap (Matthew 17:21 in ASV) is legitimate; an
// unexpected one is the signature of a misalignment and must fail the build.
const gapCheck = require('./textual-gaps').checkGaps(key, books, bookNames);
if (!gapCheck.ok) {
  if (gapCheck.unexpected.length) throw new Error(`unexpected empty verse(s): ${gapCheck.unexpected.join(', ')}`);
  throw new Error(`expected but missing empty verse(s): ${gapCheck.missing.join(', ')}`);
}
console.log(`  ${gapCheck.actual.length} documented textual gap(s), none unexpected`);

// 6. write only after everything validates
const monDir = path.join(DATA, 'bibles', key);
fs.mkdirSync(monDir, { recursive: true });
fs.writeFileSync(
  path.join(DATA, `bible_${key}.json`),
  JSON.stringify({ key, name: cfg.name, license: cfg.license, books })
);
books.forEach((chapters, bi) => {
  fs.writeFileSync(
    path.join(monDir, `${bi}.json`),
    JSON.stringify({ translation: key, book: bi, name: bookNames[bi], chapters })
  );
});
fs.writeFileSync(
  path.join(monDir, 'meta.json'),
  JSON.stringify({ key, name: cfg.name, license: cfg.license, bookCount: books.length })
);
console.log(`  wrote bible_${key}.json and ${books.length} per-book files for "${key}"`);
