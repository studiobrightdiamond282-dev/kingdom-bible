/* KINGDOM BIBLE - profile tabs fix (part 1/2).
   Overview / Appearance / Reading / Privacy / Data were plain buttons with
   no handlers - dead tabs over one long scroll. This wraps renderProfile,
   groups the settings rows into 5 panes and switches them. No app.js edits,
   listeners survive (nodes are moved, not recreated). */
(function () {
'use strict';
if (window.__kbProfileFix) return;
window.__kbProfileFix = true;
var TABS = ['overview', 'appearance', 'reading', 'privacy', 'data'];
function current() { try { return localStorage.getItem('kb.profileTab') || 'overview'; } catch (e) { return 'overview'; } }
function saveTab(t) { try { localStorage.setItem('kb.profileTab', t); } catch (e) {} }
function sectionFor(eyebrow) {
  var x = String(eyebrow || '').toUpperCase();
  if (x.indexOf('APPEARANCE') === 0) return 'appearance';
  if (x.indexOf('HELP') === 0) return 'reading';
  if (x.indexOf('PRIVACY') === 0) return 'privacy';
  return 'overview';
}
function rowTab(h3) {
  var x = String(h3 || '').toLowerCase();
  if (x.indexOf('theme') >= 0) return 'appearance';
  if (x.indexOf('translation') >= 0 || x.indexOf('install') >= 0 || x.indexOf('manual') >= 0) return 'reading';
  if (x.indexOf('local-first') >= 0 || x.indexOf('cloud account') >= 0) return 'privacy';
  if (x.indexOf('export') >= 0 || x.indexOf('clear local') >= 0) return 'data';
  if (x.indexOf('kingdom bible pro') >= 0 || x.indexOf('account') === 0
      || x.indexOf('questions') >= 0 || x.indexOf('referral') >= 0
      || x.indexOf('earning') >= 0 || x.indexOf('wallet') >= 0) return 'overview';
  return '';
}
function organize() {
  var content = document.querySelector('.settings-content');
  var nav = document.querySelector('.settings-nav');
  if (!content || !nav || nav.dataset.kbTabs) return false;
  nav.dataset.kbTabs = '1';
  var panes = {};
  TABS.forEach(function (t) {
    var d = document.createElement('div');
    d.setAttribute('data-ppane', t);
    panes[t] = d;
    content.appendChild(d);
  });
  var cur = 'overview';
  var nodes = Array.prototype.slice.call(content.childNodes);
  nodes.forEach(function (node) {
    if (node.nodeType !== 1 || node.hasAttribute('data-ppane')) return;
    var tab = cur;
    if (node.classList.contains('eyebrow')) {
      tab = sectionFor(node.textContent);
      cur = tab;
    } else if (node.classList.contains('setting-row')) {
      var h = node.querySelector('h3');
      tab = rowTab(h ? h.textContent : '') || cur;
    }
    panes[tab].appendChild(node);
  });
  var btns = nav.querySelectorAll('button');
  for (var i = 0; i < btns.length && i < TABS.length; i++) {
    (function (b, t) {
      b.setAttribute('data-ptab', t);
      b.onclick = function () { show(t); };
    })(btns[i], TABS[i]);
  }
  return true;
}
function show(t) {
  if (TABS.indexOf(t) < 0) t = 'overview';
  saveTab(t);
  var nav = document.querySelector('.settings-nav');
  if (nav) {
    var btns = nav.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('active', btns[i].getAttribute('data-ptab') === t);
    }
  }
  var panes = document.querySelectorAll('[data-ppane]');
  for (var j = 0; j < panes.length; j++) {
    panes[j].hidden = panes[j].getAttribute('data-ppane') !== t;
    if (!panes[j].hidden && !panes[j].innerHTML.trim()) {
      panes[j].innerHTML = '<p style="color:var(--muted);font-size:13px">Nothing here yet.</p>';
    }
  }
}
function hook() {
  if (typeof renderProfile !== 'function' || window.__kbProfileHooked) return false;
  window.__kbProfileHooked = true;
  var orig = renderProfile;
  renderProfile = function () {
    var r = orig.apply(this, arguments);
    try {
      if (organize()) show(current());
      else show(current());
    } catch (e) {}
    return r;
  };
  try { renderProfile = renderProfile; } catch (e) {}
  return true;
}
var tries = 0;
var iv = setInterval(function () {
  if (hook() || ++tries > 100) {
    clearInterval(iv);
    try { if (organize()) show(current()); } catch (e) {}
  }
}, 100);
try {
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('[data-ptab]') : null;
    if (b) show(b.getAttribute('data-ptab'));
  });
} catch (e) {}
})();

