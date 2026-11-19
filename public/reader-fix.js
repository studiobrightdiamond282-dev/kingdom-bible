/* KINGDOM BIBLE - bible study-panel tabs fix (part 1/2).
   Study / Notes / Saved in the reader sidebar were plain buttons with no
   handlers. This makes them real tabs: Study = verse tools + xrefs for the
   selected verse, Notes = the verse note editor inline, Saved = bookmarks
   for this chapter + all saved. No app.js edits. */
(function () {
'use strict';
if (window.__kbReaderFix) return;
window.__kbReaderFix = true;
var TABS = ['study', 'notes', 'saved'];
function curTab() { try { return localStorage.getItem('kb.readerTab') || 'study'; } catch (e) { return 'study'; } }
function saveTab(t) { try { localStorage.setItem('kb.readerTab', t); } catch (e) {} }
function selRef() {
  try {
    if (typeof selectedVerse !== 'undefined' && selectedVerse && selectedVerse.ref) return selectedVerse;
    var r = (typeof state !== 'undefined') ? state.reader : null;
    if (r && typeof books !== 'undefined' && books[r.book]) {
      return { ref: books[r.book].name + ' ' + r.chapter + ':' + (r.lastVerse || 1), verse: r.lastVerse || 1, book: r.book, chapter: r.chapter, translation: r.translation, text: '' };
    }
  } catch (e) {}
  return null;
}
function verseButtons(v) {
  var acts = [['bookmark', 'Save'], ['highlight', 'Highlight'], ['note', 'Note'], ['copy', 'Copy'], ['share', 'Share'], ['compare', 'Compare'], ['xref', 'Cross refs'], ['ai', 'Study'], ['prayer', 'Prayer'], ['memory', 'Memorize']];
  return '<div class="action-grid">' + acts.map(function (a) {
    return '<button class="action-btn" data-kb-vact="' + a[0] + '"><span></span>' + a[1] + '</button>';
  }).join('') + '</div>';
}

function paintStudy(panel) {
  var v = selRef();
  if (!v) { panel.innerHTML = '<div class="eyebrow">CHAPTER CONTEXT</div><p>Open a chapter to begin.</p>'; return; }
  var note = null, hl = null, saved = false;
  try {
    note = (state.notes && state.notes[v.ref]) || null;
    hl = (state.highlights && state.highlights[v.ref]) || null;
    saved = !!(state.bookmarks && state.bookmarks[v.ref]);
  } catch (e) {}
  var html = '<div class="eyebrow">SELECTED VERSE</div><h3>' + esc(v.ref) + '</h3>';
  if (v.text) html += '<p style="font-family:var(--scripture,Georgia,serif);font-size:15px">"' + esc(v.text) + '"</p>';
  if (note && note.content) html += '<p style="font-size:12px;color:var(--muted)">Note: ' + esc(String(note.content).slice(0, 120)) + '</p>';
  html += '<p style="font-size:11px;color:var(--muted)">' + (saved ? 'Saved' : 'Not saved') + (hl ? ' · Highlighted' : '') + '</p>';
  html += verseButtons(v);
  html += '<div id="kbXrefs"><p style="font-size:12px;color:var(--muted)">Loading cross references...</p></div>';
  panel.innerHTML = html;
  var btns = panel.querySelectorAll('[data-kb-vact]');
  for (var i = 0; i < btns.length; i++) {
    (function (b) { b.onclick = function () { try { verseAction(b.getAttribute('data-kb-vact')); } catch (e) {} }; })(btns[i]);
  }
  try {
    if (v.book != null && typeof loadXrefs === 'function') {
      loadXrefs(v.book).then(function (d) {
        var refs = (d && d[v.ref]) || [];
        var box = panel.querySelector('#kbXrefs');
        if (!box) return;
        box.innerHTML = '<div class="eyebrow" style="margin-top:12px">CROSS REFERENCES</div>'
          + (refs.length ? '<p>' + refs.slice(0, 6).map(function (r) { return '<button class="citation" data-ref="' + esc(r.split(',')[0]) + '">' + esc(r) + '</button>'; }).join(' ') + '</p>' : '<p style="font-size:12px;color:var(--muted)">None indexed for this verse.</p>');
        var cs = box.querySelectorAll('.citation');
        for (var j = 0; j < cs.length; j++) { (function (c) { c.onclick = function () { openReference(c.dataset.ref); }; })(cs[j]); }
      }, function () {
        var box2 = panel.querySelector('#kbXrefs');
        if (box2) box2.innerHTML = '';
      });
    }
  } catch (e) {}
}
function paintNotes(panel) {
  var v = selRef();
  if (!v) { panel.innerHTML = '<p>Select a verse first.</p>'; return; }
  var old = {};
  try { old = (state.notes && state.notes[v.ref]) || {}; } catch (e) {}
  panel.innerHTML = '<div class="eyebrow">VERSE NOTE</div><h3>' + esc(v.ref) + '</h3>'
    + '<div class="field full"><label>Title</label><input id="kbNoteTitle" value="' + esc(old.title || '') + '" placeholder="What stood out?"></div>'
    + '<div class="field full" style="margin-top:8px"><label>Note</label><textarea id="kbNoteBody" rows="4" placeholder="Write your reflection...">' + esc(old.content || '') + '</textarea></div>'
    + '<div class="modal-actions"><button class="primary-btn" id="kbNoteSave">Save note</button></div>';
  var sv = panel.querySelector('#kbNoteSave');
  if (sv) sv.onclick = function () {
    var t = panel.querySelector('#kbNoteTitle').value.trim() || v.ref;
    var c = panel.querySelector('#kbNoteBody').value.trim();
    try {
      state.notes[v.ref] = { title: t, content: c, text: v.text || '', date: today() };
      save();
    } catch (e) {}
    toast('Note saved', 'success');
    paintNotes(panel);
  };
}
function paintSaved(panel) {
  var list = [];
  try {
    var r = state.reader;
    Object.keys(state.bookmarks || {}).forEach(function (ref) {
      var b = state.bookmarks[ref];
      list.push({ ref: ref, text: b.text || '' });
    });
  } catch (e) {}
  var inChapter = [], others = [];
  try {
    var r2 = state.reader, prefix = books[r2.book].name + ' ' + r2.chapter + ':';
    list.forEach(function (x) { (x.ref.indexOf(prefix) === 0 ? inChapter : others).push(x); });
  } catch (e) { others = list; }
  function item(x) {
    return '<div class="setting-row"><div><h3>' + esc(x.ref) + '</h3><p>' + esc(String(x.text).slice(0, 90)) + '</p></div><button class="secondary-btn small-btn" data-kb-open="' + esc(x.ref) + '">Open</button></div>';
  }
  panel.innerHTML = '<div class="eyebrow">SAVED IN THIS CHAPTER</div>'
    + (inChapter.length ? inChapter.map(item).join('') : '<p style="font-size:12px;color:var(--muted)">No saved verses here yet. Tap a verse, then Save.</p>')
    + '<div class="eyebrow" style="margin-top:14px">ALL SAVED (' + list.length + ')</div>'
    + (others.length ? others.slice(0, 12).map(item).join('') : '<p style="font-size:12px;color:var(--muted)">Nothing saved yet.</p>');
  var btns = panel.querySelectorAll('[data-kb-open]');
  for (var i = 0; i < btns.length; i++) {
    (function (b) { b.onclick = function () { openReference(b.getAttribute('data-kb-open')); }; })(btns[i]);
  }
}
function show(t) {
  if (TABS.indexOf(t) < 0) t = 'study';
  saveTab(t);
  var tabs = document.querySelector('.study-tabs');
  if (tabs) {
    var btns = tabs.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('active', btns[i].getAttribute('data-kb-rtab') === t);
  }
  var panel = document.querySelector('#contextPanel');
  if (!panel) return;
  if (t === 'notes') paintNotes(panel);
  else if (t === 'saved') paintSaved(panel);
  else paintStudy(panel);
}

function wire() {
  var tabs = document.querySelector('.study-tabs');
  if (!tabs || tabs.dataset.kbWired) return false;
  tabs.dataset.kbWired = '1';
  var btns = tabs.querySelectorAll('button');
  var names = ['study', 'notes', 'saved'];
  for (var i = 0; i < btns.length && i < names.length; i++) {
    (function (b, t) {
      b.setAttribute('data-kb-rtab', t);
      b.onclick = function () { show(t); };
    })(btns[i], names[i]);
  }
  return true;
}
function hookVerse() {
  if (typeof openVerse !== 'function' || window.__kbVerseHooked) return false;
  window.__kbVerseHooked = true;
  var orig = openVerse;
  openVerse = function (v, text) {
    var r = orig.apply(this, arguments);
    try { show(curTab()); } catch (e) {}
    return r;
  };
  try { openVerse = openVerse; } catch (e) {}
  return true;
}
var tries = 0;
var iv = setInterval(function () {
  var a = wire(), b = hookVerse();
  if (document.querySelector('#contextPanel') && (a || b)) { try { show(curTab()); } catch (e) {} }
  if ((a && b) || ++tries > 120) clearInterval(iv);
}, 150);
try {
  /* One-time readability bump: existing profiles saved fontSize 20 before the
     default grew to 22. Anyone who never touched the slider gets the larger
     text once; anyone who chose their own size keeps it. */
  try {
    if (!localStorage.getItem('kb.fontBump22') && typeof state !== 'undefined' && state.profile && state.profile.fontSize === 20) {
      state.profile.fontSize = 22;
      if (typeof save === 'function') save();
    }
    localStorage.setItem('kb.fontBump22', '1');
  } catch (e) {}
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('[data-kb-rtab]') : null;
    if (b) show(b.getAttribute('data-kb-rtab'));
    var v = e.target && e.target.closest ? e.target.closest('.verse') : null;
    if (v) setTimeout(function () { try { if (document.querySelector('#contextPanel')) show(curTab()); } catch (err) {} }, 120);
  });
} catch (e) {}
})();
