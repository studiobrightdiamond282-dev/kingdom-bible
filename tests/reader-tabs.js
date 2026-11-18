#!/usr/bin/env node
'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync(require.resolve('../public/reader-fix.js'), 'utf8');
const storage = new Map();
const noteTitle = { value: '' }, noteBody = { value: '' }, noteSave = { onclick: null };
const studyActions = [];
const savedLinks = [];
const panel = {
  innerHTML: '',
  querySelectorAll(selector) {
    if (selector === '[data-kb-vact]') return studyActions;
    if (selector === '[data-kb-open]') return savedLinks;
    return [];
  },
  querySelector(selector) {
    if (selector === '#kbNoteTitle') return noteTitle;
    if (selector === '#kbNoteBody') return noteBody;
    if (selector === '#kbNoteSave') return noteSave;
    if (selector === '#kbXrefs') return { innerHTML: '', querySelectorAll: () => [] };
    return null;
  }
};
const toggles = [];
const buttons = ['Study', 'Notes', 'Saved'].map(text => ({
  textContent: text,
  attrs: {},
  classList: { toggle(name, value) { toggles.push([text, name, value]); } },
  setAttribute(name, value) { this.attrs[name] = value; },
  getAttribute(name) { return this.attrs[name]; }
}));
const tabs = {
  dataset: {},
  querySelectorAll: selector => selector === 'button' ? buttons : []
};
const listeners = {};
let interval;
let saveCount = 0;
const toastMessages = [];
const state = {
  reader: { book: 42, chapter: 3, lastVerse: 16, translation: 'kjv' },
  notes: {}, highlights: {}, bookmarks: { 'John 3:16': { text: 'Saved verse', folder: 'Favorite Scriptures' } },
  profile: { fontSize: 20 }
};
const ctx = {
  console, window: {}, localStorage: {
    getItem: key => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value)
  },
  document: {
    querySelector: selector => selector === '.study-tabs' ? tabs : selector === '#contextPanel' ? panel : null,
    querySelectorAll: () => [],
    addEventListener(type, cb) { listeners[type] = cb; }
  },
  setInterval(cb) { interval = cb; return 1; }, clearInterval() {}, setTimeout() { return 1; },
  state, books: JSON.parse(fs.readFileSync(require.resolve('../public/data/books.json'), 'utf8')).books,
  selectedVerse: null,
  save() { saveCount++; }, toast(message) { toastMessages.push(message); },
  esc: x => String(x), today: () => '2026-11-18', verseAction() {},
  loadXrefs: async () => ({}), openReference() {},
  openVerse(verse, text) {
    this.selectedVerse = { ref: 'John 3:' + verse, verse, book: 42, chapter: 3, translation: 'kjv', text };
  }
};
vm.createContext(ctx);
vm.runInContext(source, ctx, { filename: 'reader-fix.js' });
assert.strictEqual(typeof interval, 'function', 'reader hooks schedule their wire-up');
interval();
assert.strictEqual(tabs.dataset.kbWired, '1', 'reader tabs are wired once the reader exists');
assert.deepStrictEqual(buttons.map(b => b.attrs['data-kb-rtab']), ['study', 'notes', 'saved']);
assert(panel.innerHTML.includes('SELECTED VERSE'), 'Study tab shows the selected verse tools');
assert.strictEqual(ctx.state.profile.fontSize, 22, 'the one-time readability bump applies to the untouched default');
assert.strictEqual(storage.get('kb.fontBump22'), '1');

buttons[1].onclick();
assert(panel.innerHTML.includes('VERSE NOTE'), 'Notes tab opens its inline note editor');
noteTitle.value = 'Promise';
noteBody.value = 'A saved reflection.';
noteSave.onclick();
assert.strictEqual(ctx.state.notes['John 3:16'].content, 'A saved reflection.');
assert(toastMessages.includes('Note saved'));

buttons[2].onclick();
assert(panel.innerHTML.includes('SAVED IN THIS CHAPTER'), 'Saved tab lists chapter bookmarks');
assert(panel.innerHTML.includes('John 3:16'));
buttons[0].onclick();
ctx.openVerse(17, 'For God sent not his Son');
assert.strictEqual(ctx.selectedVerse.ref, 'John 3:17');
assert(panel.innerHTML.includes('John 3:17'), 'opening a new verse refreshes the active reader tab context');
console.log('✓ Reader Study/Notes/Saved tabs, note persistence, verse updates, and one-time font adjustment');
