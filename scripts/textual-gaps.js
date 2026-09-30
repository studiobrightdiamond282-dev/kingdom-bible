'use strict';
/**
 * Verses that exist in the KJV versification but carry no text in a given
 * translation, because that translation follows a different textual tradition.
 *
 * These are genuine textual variants, not defects. For example Matthew 17:21
 * ("...move this mountain") and Mark 9:44 are present in the KJV but absent
 * from the Textus Receptus behind the ASV and WEB. The app keeps every verse
 * slot so that references stay aligned, which means these positions are
 * legitimately blank.
 *
 * The build and the smoke test both assert that a translation's blank slots
 * match this list EXACTLY. That way a known gap is allowed, while any new or
 * unexpected blank verse — the signature of a real misalignment — fails loudly.
 */
const GAPS = {
  kjv: [],
  ylt: [],
  bbe: [],
  asv: [
    'Matthew 17:21', 'Matthew 18:11', 'Matthew 23:14',
    'Mark 7:16', 'Mark 9:44', 'Mark 9:46', 'Mark 11:26', 'Mark 15:28',
    'Luke 17:36', 'Luke 23:17',
    'John 5:4',
    'Acts 8:37', 'Acts 15:34', 'Acts 24:7', 'Acts 28:29',
    'Romans 16:24'
  ],
  web: ['Luke 17:36', 'Acts 8:37', 'Acts 15:34', 'Acts 24:7']
};

/** Every blank verse slot in a translation, as "Book C:V" strings, sorted. */
function findGaps(books, bookNames) {
  const out = [];
  books.forEach((chapters, bi) => {
    chapters.forEach((verses, ci) => {
      verses.forEach((v, vi) => {
        if (v === null || v === undefined || !String(v).trim()) {
          out.push(`${bookNames[bi]} ${ci + 1}:${vi + 1}`);
        }
      });
    });
  });
  return out.sort();
}

/** Compare actual blank slots against the documented ones. */
function checkGaps(key, books, bookNames) {
  const expected = (GAPS[key] || []).slice().sort();
  const actual = findGaps(books, bookNames);
  const missing = expected.filter((g) => !actual.includes(g));
  const unexpected = actual.filter((g) => !expected.includes(g));
  return { expected, actual, missing, unexpected, ok: !missing.length && !unexpected.length };
}

module.exports = { GAPS, findGaps, checkGaps };
