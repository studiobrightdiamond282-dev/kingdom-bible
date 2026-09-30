#!/usr/bin/env node
'use strict';
/**
 * Sync merge tests. Data loss would be the worst bug in this app, so the rule
 * under test is: merging cloud data must NEVER remove or overwrite anything
 * already on this device.
 */
const assert = require('assert');
const S = require('../public/sync-merge.js');

const blank = () => ({
  bookmarks: {}, highlights: {}, notes: {}, prayers: [], planProgress: {},
  favorites: {}, readingDays: [], chaptersRead: [], devotionalDone: [],
  collections: {}, history: [], profile: { name: 'Stanley' }
});

let state;
const run = (remote) => S.merge(state, remote);

console.log('Only whitelisted keys are ever read');
assert.ok(S.SYNCABLE.includes('bookmarks') && S.SYNCABLE.includes('collections'), 'personal data must sync');
assert.ok(S.SYNCABLE.includes('profile'), 'preferences should sync');
['account', 'installed', 'notifSeen', 'ministry', 'reader', 'aiHistory'].forEach((k) => {
  assert.ok(!S.SYNCABLE.includes(k), `${k} must stay on this device`);
});
console.log('  ok  personal data syncs; device-local and ministry state does not');

console.log('\nA verse saved on another device is added');
state = blank();
state.bookmarks['John 3:16'] = { text: 'For God so loved the world', date: '2026-01-01' };
const n1 = run({ bookmarks: { 'Psalms 23:1': { text: 'The LORD is my shepherd', date: '2026-01-02' } } });
assert.ok(n1 > 0, 'the merge should report a change');
assert.ok(state.bookmarks['John 3:16'], 'the existing bookmark must survive');
assert.ok(state.bookmarks['Psalms 23:1'], 'the new bookmark should arrive');
console.log('  ok  both verses present after the merge');

console.log('\nA local bookmark is never overwritten by the cloud');
state = blank();
state.bookmarks['John 3:16'] = { text: 'MY LOCAL WORDS', date: '2026-01-01' };
run({ bookmarks: { 'John 3:16': { text: 'cloud words', date: '2020-01-01' } } });
assert.strictEqual(state.bookmarks['John 3:16'].text, 'MY LOCAL WORDS', 'local text must win');
console.log('  ok  local version kept on conflict');

console.log('\nReading days union, so history is never lost');
state = blank();
state.readingDays = ['2026-01-01', '2026-01-02'];
run({ readingDays: ['2026-01-02', '2026-01-03'] });
assert.deepStrictEqual(state.readingDays.slice().sort(), ['2026-01-01', '2026-01-02', '2026-01-03']);
console.log('  ok  days from both devices kept, with no duplicates');

console.log('\nChapters read union');
state = blank();
state.chaptersRead = ['42:3'];
run({ chaptersRead: ['42:3', '41:1'] });
assert.strictEqual(state.chaptersRead.length, 2);
console.log('  ok  both devices chapters are retained');

console.log('\nCollections merge without dropping verses');
state = blank();
state.collections = { local: { id: 'local', name: 'Local set', refs: ['John 3:16'], created: '2026-01-01' } };
run({
  collections: {
    local: { id: 'local', name: 'Local set', refs: ['John 3:16', 'Psalms 23:1'], created: '2026-01-01' },
    remote: { id: 'remote', name: 'Cloud set', refs: ['Romans 8:28'], created: '2026-01-02' }
  }
});
assert.ok(state.collections.local, 'the local collection must survive');
assert.ok(state.collections.remote, 'the cloud collection must arrive');
assert.ok(state.collections.local.refs.includes('Psalms 23:1'), 'a verse added elsewhere should merge in');
console.log('  ok  collections from both devices coexist and gather their verses');

console.log('\nNested note fields merge without loss');
state = blank();
state.notes['Psalms 23:1'] = { title: 'Shepherd', content: 'local words' };
run({ notes: { 'Psalms 23:1': { title: 'Shepherd', content: 'local words', tags: ['hope'] } } });
assert.deepStrictEqual(state.notes['Psalms 23:1'].tags, ['hope'], 'a missing nested field should be filled');
assert.strictEqual(state.notes['Psalms 23:1'].content, 'local words', 'existing content must stay');
console.log('  ok  missing nested fields filled, existing ones untouched');

console.log('\nA brand new device receives the whole library');
state = blank();
run({
  bookmarks: { 'John 3:16': { text: 'a' }, 'Psalms 23:1': { text: 'b' } },
  notes: { 'Romans 8:28': { title: 'All things' } },
  collections: { gifts: { id: 'gifts', name: 'Gifts', refs: ['Romans 8:28'], created: '2026-01-01' } },
  readingDays: ['2026-01-01'],
  profile: { name: 'Reader', theme: 'light' }
});
assert.strictEqual(Object.keys(state.bookmarks).length, 2);
assert.ok(state.notes['Romans 8:28'], 'notes should arrive');
assert.ok(state.collections.gifts, 'collections should arrive');
assert.strictEqual(state.profile.theme, 'light', 'preferences should arrive');
console.log('  ok  an empty device is fully populated from the cloud');

console.log('\nNonsense input is ignored, not merged');
state = blank();
state.bookmarks = { keep: { text: 'mine' } };
[null, undefined, 'a string', 42, [], true].forEach((bad) => {
  assert.strictEqual(run(bad), 0, `${JSON.stringify(bad)} should change nothing`);
});
assert.deepStrictEqual(state.bookmarks, { keep: { text: 'mine' } });
console.log('  ok  null, undefined, string, number, array and boolean change nothing');

console.log('\nA type mismatch falls back to the cloud value rather than corrupting state');
state = blank();
state.prayers = 'not-an-array';
run({ prayers: [{ text: 'a prayer' }] });
assert.ok(Array.isArray(state.prayers), 'state should end up a valid array');
console.log('  ok  mismatched shapes are replaced, not merged into');

console.log('\nA hostile payload cannot set protected state');
state = blank();
run({ bookmarks: { a: { text: 'x' } }, account: { email: 'evil@x.test' }, installed: true, ministry: { church: 'Evil' } });
assert.ok(state.bookmarks.a, 'a whitelisted key should merge');
assert.strictEqual(state.account, undefined, 'account must not be written');
assert.strictEqual(state.installed, undefined, 'installed must not be written');
assert.strictEqual(state.ministry, undefined, 'ministry must not be written');
console.log('  ok  account, installed and ministry are ignored');

console.log('\nMerging twice is idempotent');
state = blank();
const payload = {
  bookmarks: { a: { text: '1' } },
  readingDays: ['2026-01-01'],
  notes: { n: { title: 't' } },
  collections: { c: { id: 'c', name: 'C', refs: ['a'] } }
};
const first = run(payload);
const snapshot = JSON.stringify(state);
const second = run(payload);
assert.strictEqual(JSON.stringify(state), snapshot, 'a second identical merge must change nothing');
assert.strictEqual(second, 0, 'the second merge reports no changes');
assert.ok(first > 0);
console.log('  ok  repeating a sync does not duplicate or churn data');

console.log('\npick() sends only whitelisted keys');
const outgoing = S.pick({ ...blank(), account: { email: 'x@y.z' }, installed: true, ministry: {} });
assert.ok(outgoing.bookmarks, 'personal data is sent');
assert.strictEqual(outgoing.account, undefined, 'account must not leave the device');
assert.strictEqual(outgoing.installed, undefined, 'install flag must not leave the device');
assert.strictEqual(outgoing.ministry, undefined, 'ministry settings must not leave the device');
console.log('  ok  uploads are limited to the whitelist');

console.log('\nAll sync merge tests passed.');
