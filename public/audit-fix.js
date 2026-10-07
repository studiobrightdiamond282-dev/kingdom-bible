/* KINGDOM BIBLE - audit fixes part 1/3: prayer filter, themes, collections. */
(function () {
'use strict';
if (window.__kbAuditFix) return;
window.__kbAuditFix = true;
var PFKEY = 'kb.prayerFilter';
function pfGet() { try { return localStorage.getItem(PFKEY) || 'All'; } catch (e) { return 'All'; } }
function pfSet(v) { try { localStorage.setItem(PFKEY, v); } catch (e) {} }
function applyPrayerFilter(f) {
  var items = document.querySelectorAll('#main .prayer-item'), shown = 0, i;
  for (i = 0; i < items.length; i++) {
    var pills = items[i].querySelectorAll('.pill');
    var st = pills.length > 1 ? pills[1].textContent.trim() : '';
    var show = (f === 'All' || st === f);
    items[i].style.display = show ? '' : 'none';
    if (show) shown++;
  }
  var list = document.querySelector('#main .prayer-list'), note = document.getElementById('kbPrayerEmpty');
  if (list && items.length && !shown) {
    if (!note) { note = document.createElement('div'); note.id = 'kbPrayerEmpty'; note.className = 'card empty-state'; list.appendChild(note); }
    note.innerHTML = '<h3>No ' + esc(f.toLowerCase()) + ' prayers</h3><p>Try another filter, or add a new prayer.</p>';
  } else if (note) { note.remove(); }
}
function paintPrayerFilter() {
  if (typeof route !== 'undefined' && route !== 'prayer') return;
  var box = document.querySelector('#main .section-head > div:last-child');
  var old = box && box.querySelector('.filter-chip');
  if (!box || !old || box.querySelector('[data-kb-pf]')) return;
  var cur = pfGet();
  var names = ['All', 'Praying', 'Waiting', 'Answered'];
  box.innerHTML = names.map(function (s) {
    return '<button class="filter-chip' + (s === cur ? ' active' : '') + '" data-kb-pf="' + s + '">' + s + '</button>';
  }).join('');
  box.style.display = 'flex'; box.style.gap = '6px'; box.style.flexWrap = 'wrap';
  var btns = box.querySelectorAll('[data-kb-pf]'), i;
  for (i = 0; i < btns.length; i++) (function (b) {
    b.onclick = function () {
      var f = b.getAttribute('data-kb-pf'), j;
      pfSet(f);
      for (j = 0; j < btns.length; j++) btns[j].classList.toggle('active', btns[j] === b);
      applyPrayerFilter(f);
    };
  })(btns[i]);
  applyPrayerFilter(cur);
}
function hookPrayer() {
  if (typeof renderPrayer !== 'function' || window.__kbAuditPrayer) return;
  window.__kbAuditPrayer = true;
  var orig = renderPrayer;
  renderPrayer = function () {
    var r = orig.apply(this, arguments);
    try { paintPrayerFilter(); } catch (e) {}
    try { var rb = document.getElementById('prayerReminder'); if (rb) rb.onclick = openReminderPlus; } catch (e) {}
    return r;
  };
}
var THEMES = ['light', 'dark', 'sepia', 'amoled', 'contrast'];
function hookTheme() {
  if (typeof cycleTheme !== 'function' || window.__kbAuditTheme) return;
  window.__kbAuditTheme = true;
  cycleTheme = function () {
    var i = THEMES.indexOf(state.profile.theme);
    state.profile.theme = THEMES[(i + 1) % THEMES.length];
    save();
    toast(state.profile.theme[0].toUpperCase() + state.profile.theme.slice(1) + ' theme');
  };
}
function hookCollections() {
  if (typeof verseAction !== 'function' || window.__kbAuditColl) return;
  window.__kbAuditColl = true;
  var orig = verseAction;
  verseAction = function (a) {
    if (a === 'collection') { try { openCollectionPicker(); } catch (e) {} return; }
    return orig.apply(this, arguments);
  };
}
function existingFolders() {
  var out = ['Favorite Scriptures'], seen = { 'Favorite Scriptures': 1 };
  try {
    var bms = (typeof state !== 'undefined' && state.bookmarks) || {};
    Object.keys(bms).forEach(function (k) {
      var f = bms[k] && bms[k].folder;
      if (f && !seen[f]) { seen[f] = 1; out.push(f); }
    });
  } catch (e) {}
  return out;
}
function openCollectionPicker() {
  var v = null;
  try { v = selectedVerse; } catch (e) {}
  if (!v || !v.ref) { toast('Select a verse first', 'error'); return; }
  var folders = existingFolders(), current = 'Favorite Scriptures';
  try { current = (state.bookmarks[v.ref] || {}).folder || 'Favorite Scriptures'; } catch (e) {}
  modal('<div class="modal-head"><div><div class="eyebrow">COLLECTIONS</div><h2>Save to collection</h2><p>'
    + esc(v.ref) + '</p></div><button class="close-btn" data-close>×</button></div>'
    + '<div class="field"><label>Collection</label><select id="kbCollPick">'
    + folders.map(function (f) { return '<option' + (f === current ? ' selected' : '') + '>' + esc(f) + '</option>'; }).join('')
    + '</select></div>'
    + '<div class="field" style="margin-top:12px"><label>Or a new collection</label><input id="kbCollNew" placeholder="e.g. Sermon illustrations"/></div>'
    + '<div class="modal-actions"><button class="secondary-btn" data-close>Cancel</button><button class="primary-btn" id="kbCollSave">Save verse</button></div>');
  document.getElementById('kbCollSave').onclick = function () {
    var name = (document.getElementById('kbCollNew').value || '').trim() || document.getElementById('kbCollPick').value;
    state.bookmarks[v.ref] = { text: v.text, date: today(), folder: name };
    save(); closeModal(); toast('Saved to ' + name, 'success');
  };
}
function seedCustomPlans() {
  try {
    if (!state.customPlans) state.customPlans = [];
    (PLANS || []).forEach(function (p) { p.custom = false; });
    state.customPlans.forEach(function (c) {
      if (!PLANS.some(function (p) { return p.id === c.id; })) PLANS.push(c);
    });
  } catch (e) {}
}
function hookPlans() {
  seedCustomPlans();
  if (typeof renderPlans !== 'function' || window.__kbAuditPlans) return;
  window.__kbAuditPlans = true;
  var orig = renderPlans;
  renderPlans = function () {
    seedCustomPlans();
    var r = orig.apply(this, arguments);
    try {
      var b = document.getElementById('customPlan');
      if (b) b.onclick = openCustomPlan;
      var dels = document.querySelectorAll('[data-kb-delplan]'), i;
      for (i = 0; i < dels.length; i++) (function (d) {
        d.onclick = function (ev) {
          ev.stopPropagation();
          var id = d.getAttribute('data-kb-delplan');
          try {
            state.customPlans = (state.customPlans || []).filter(function (c) { return c.id !== id; });
            for (var k = PLANS.length - 1; k >= 0; k--) { if (PLANS[k].id === id && PLANS[k].custom) PLANS.splice(k, 1); }
            delete state.planProgress[id];
            save(); renderPlans(); toast('Custom plan removed', 'success');
          } catch (e) {}
        };
      })(dels[i]);
    } catch (e) {}
    return r;
  };
  if (typeof openPlan === 'function' && !window.__kbAuditOpenPlan) {
    window.__kbAuditOpenPlan = true;
    var op = openPlan;
    openPlan = function (id) {
      if (String(id || '').indexOf('custom-') === 0 && !PLANS.some(function (p) { return p.id === id; })) {
        try {
          var c = (state.customPlans || []).filter(function (x) { return x.id === id; })[0];
          if (c) PLANS.push(c);
        } catch (e) {}
      }
      return op.apply(this, arguments);
    };
  }
  if (typeof planReading === 'function' && !window.__kbAuditPlanRead) {
    window.__kbAuditPlanRead = true;
    var pr = planReading;
    planReading = function (id, n) {
      try {
        var c = null, k;
        for (k = 0; k < PLANS.length; k++) { if (PLANS[k].id === id && PLANS[k].custom) c = PLANS[k]; }
        if (!c) c = (state.customPlans || []).filter(function (x) { return x.id === id; })[0];
        if (c && c.refs && c.refs.length) return c.refs[Math.min(n, c.refs.length - 1)];
      } catch (e) {}
      return pr.apply(this, arguments);
    };
  }
}
function openCustomPlan() {
  modal('<div class="modal-head"><div><div class="eyebrow">READING PLANS</div><h2>New custom plan</h2><p>Stored on this device · works offline</p></div><button class="close-btn" data-close>×</button></div>'
    + '<div class="form-grid"><div class="field full"><label>Plan name</label><input id="kbPlanName" placeholder="e.g. Faith foundations"/></div>'
    + '<div class="field full"><label>Passages — one per line</label><textarea id="kbPlanRefs" rows="5" placeholder="John 3:16&#10;Psalms 23&#10;Romans 8:28"></textarea></div></div>'
    + '<div class="modal-actions"><button class="secondary-btn" data-close>Cancel</button><button class="primary-btn" id="kbPlanSave">Create plan</button></div>');
  document.getElementById('kbPlanSave').onclick = function () {
    var name = (document.getElementById('kbPlanName').value || '').trim();
    var refs = (document.getElementById('kbPlanRefs').value || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    if (!name) { toast('Give the plan a name', 'error'); return; }
    if (!refs.length) { toast('Add at least one passage', 'error'); return; }
    var id = 'custom-' + Date.now().toString(36);
    var plan = { id: id, icon: '◫', name: name, days: refs.length, desc: 'Custom plan · ' + refs.length + ' day' + (refs.length === 1 ? '' : 's') + '.', refs: refs, custom: true };
    try {
      if (!state.customPlans) state.customPlans = [];
      state.customPlans.push(plan); save();
    } catch (e) {}
    closeModal(); renderPlans(); toast('Custom plan created', 'success');
  };
}

function openReminderPlus() {
  var cur = '07:00';
  try { cur = state.profile.prayerTime || '07:00'; } catch (e) {}
  modal('<div class="modal-head"><div><h2>Prayer reminder</h2><p>Prayer reminder time</p></div><button class="close-btn" data-close>×</button></div>'
    + '<div class="field"><label>Reminder time</label><input type="time" id="reminderTime" value="' + cur + '"></div>'
    + '<div class="notice" style="margin-top:15px">This reminder lives on this device only. While the app is open it shows a prayer card at your chosen time; nothing is sent anywhere and the system notification permission is never requested.</div>'
    + '<div class="modal-actions"><button class="secondary-btn" data-close>Cancel</button><button class="primary-btn" id="saveReminder">Save preference</button></div>');
  document.getElementById('saveReminder').onclick = function () {
    state.profile.prayerTime = document.getElementById('reminderTime').value;
    save(); closeModal(); toast('Reminder preference saved');
  };
}
var __kbRemKey = 'kb.reminderFired';
function reminderFiredToday() {
  try { return localStorage.getItem(__kbRemKey) === new Date().toISOString().slice(0, 10); } catch (e) { return true; }
}
function markReminderFired() {
  try { localStorage.setItem(__kbRemKey, new Date().toISOString().slice(0, 10)); } catch (e) {}
}
function checkPrayerReminder() {
  try {
    var t = (state.profile || {}).prayerTime;
    if (!t || reminderFiredToday()) return;
    var now = new Date();
    var hh = ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2);
    if (hh < t) return;
    markReminderFired();
    modal('<div class="modal-head"><div><div class="eyebrow">PRAYER REMINDER</div><h2>Time to pray</h2><p>Your chosen time · ' + esc(t) + '</p></div><button class="close-btn" data-close>×</button></div>'
      + '<div class="notice">"Be careful for nothing; but in every thing by prayer and supplication with thanksgiving let your requests be made known unto God." — Philippians 4:6</div>'
      + '<div class="modal-actions"><button class="secondary-btn" data-close>Later</button><button class="primary-btn" id="kbRemOpen">Open prayer journal</button></div>');
    var b = document.getElementById('kbRemOpen');
    if (b) b.onclick = function () { closeModal(); try { navigate('prayer'); } catch (e) {} };
  } catch (e) {}
}
var __kbTries = 0;
var __kbIv = setInterval(function () {
  var ready = (typeof renderPrayer === 'function' && typeof verseAction === 'function'
    && typeof renderPlans === 'function' && typeof cycleTheme === 'function');
  if (ready || ++__kbTries > 100) {
    clearInterval(__kbIv);
    try { hookPrayer(); hookTheme(); hookCollections(); hookPlans(); paintPrayerFilter(); } catch (e) {}
    try { checkPrayerReminder(); setInterval(checkPrayerReminder, 60000); } catch (e) {}
  }
}, 100);
})();
