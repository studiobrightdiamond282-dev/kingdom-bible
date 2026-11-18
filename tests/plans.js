#!/usr/bin/env node
'use strict';
const assert = require('assert');
const plans = require('../public/reading-plans.js');
const REF = require('../public/bible-ref.js');
const books = require('../public/data/books.json').books;

function collect(id, days) {
  const byDay = Array.from({ length: days }, (_, day) => plans.readings(id, day, books));
  return { byDay, flat: byDay.flat() };
}
function chapterKeys(refs) {
  return refs.map(ref => {
    const parsed = REF.parse(ref, books);
    assert(parsed, `${ref} must be a valid Bible reference`);
    assert.strictEqual(parsed.verse, null, `${ref} should address a chapter`);
    return `${parsed.book}:${parsed.chapter}`;
  });
}
function assertEveryChapterOnce(id, days, firstBook, endBook, minPerDay, maxPerDay) {
  const { byDay, flat } = collect(id, days);
  const keys = chapterKeys(flat);
  const expected = plans.chapterRefs(books, firstBook, endBook).length;
  assert.strictEqual(keys.length, expected, `${id} should cover all ${expected} chapters`);
  assert.strictEqual(new Set(keys).size, expected, `${id} must not repeat a chapter or skip one`);
  byDay.forEach((items, i) => assert(items.length >= minPerDay && items.length <= maxPerDay,
    `${id} day ${i + 1} should contain ${minPerDay}–${maxPerDay} chapters (got ${items.length})`));
}

assertEveryChapterOnce('year', 365, 0, 66, 3, 4);
assertEveryChapterOnce('nt90', 90, 39, 66, 2, 3);
assertEveryChapterOnce('gospels30', 30, 39, 43, 2, 3);
assertEveryChapterOnce('psalms30', 30, 18, 19, 5, 5);
assertEveryChapterOnce('proverbs31', 31, 19, 20, 1, 1);

for (const [id, days] of Object.entries(plans.DAYS)) {
  for (let day = 0; day < days; day++) {
    const refs = plans.readings(id, day, books);
    assert(refs.length > 0, `${id} day ${day + 1} must have a reading`);
    refs.forEach(ref => assert(REF.parse(ref, books), `${id} day ${day + 1}: invalid reference ${ref}`));
  }
}
assert.strictEqual(plans.readings('year', 365, books).join('|'), plans.readings('year', 364, books).join('|'),
  'completed plans should keep showing the final day rather than an empty reading');
const app = require('fs').readFileSync(require('path').join(__dirname, '../public/app.js'), 'utf8');
const auditFix = require('fs').readFileSync(require('path').join(__dirname, '../public/audit-fix.js'), 'utf8');
assert(app.includes('function planReadings(id,n){return window.KingdomPlans?.readings(id,n,books,state.customPlans||[])'),
  'the UI must use the shared plan schedule, including custom plans');
assert(app.includes('data-plan-ref=\"${i}\"') && app.includes('openReference(readings[Number(b.dataset.planRef)])'),
  'every displayed daily reading must open the referenced Bible passage');
assert(app.includes('state.planProgress[id]=Math.min(p.days,n+1)'),
  'marking a plan day complete must advance one day and stop at the plan length');
assert(auditFix.includes('state.customPlans.push(plan)') && auditFix.includes('filter(function (c) { return c.id !== id; })'),
  'custom plans must persist on create and be removable');
assert(app.includes('A private in-app reminder appears at your chosen time while Kingdom Bible is open.'),
  'prayer reminder copy must say it only appears in-app while the app is open');
assert(auditFix.includes("localStorage.getItem(__kbRemKey) === today()") && auditFix.includes("localStorage.setItem(__kbRemKey, today())"),
  'reminder once-per-day keys must use the local calendar date');
assert(!/Notification\s*\.\s*requestPermission/.test(app + auditFix),
  'prayer reminder must not request browser system-notification permission');
assert(!/[¦ï¼¢]/.test(app), 'the main app must not contain the audited placeholder or mojibake glyphs');
assert.deepStrictEqual(plans.readings('custom-1', 1, books, [{ id: 'custom-1', refs: ['John 3:16', 'Psalm 23'] }]), ['Psalm 23']);
assert.deepStrictEqual(plans.readings('unknown', 0, books), []);
console.log('✓ Whole-Bible, New Testament, Gospel, Psalms, and Proverbs plans cover every scheduled chapter exactly once');
console.log('✓ All curated and custom plan days return valid references');
