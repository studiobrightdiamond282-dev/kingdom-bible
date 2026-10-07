/* KINGDOM BIBLE - sign-in banner glitch fix (part 1/2).
   The stuck bar is the signed_out state of #trialBanner painted before the
   session resolves on slow mobile data. Never show the guest invite until
   the account is KNOWN signed-out; signed-in users never see it. */
(function () {
'use strict';
if (window.__kbBannerFix) return;
window.__kbBannerFix = true;
var DISMISS_KEY = 'kb.bannerDismissed.v1';
function dismissed() { try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch (e) { return false; } }
function setDismissed() { try { localStorage.setItem(DISMISS_KEY, '1'); } catch (e) {} }
function banner() { return document.querySelector('#trialBanner'); }
function wrap() {
  if (typeof paintTrialBanner !== 'function' || window.__kbOrigPaint) return false;
  window.__kbOrigPaint = paintTrialBanner;
  paintTrialBanner = function () {
    var el = banner();
    if (!el) return;
    var s = (typeof accountState !== 'undefined') ? accountState : { status: 'signed_out' };
    if (!window.__kbAuthKnown && s.status === 'signed_out' && !s.signedIn) {
      el.hidden = true; el.innerHTML = ''; return;
    }
    if (s.signedIn && s.status !== 'expired' && !(s.status === 'trial' && s.daysRemaining <= 7)) {
      el.hidden = true; el.innerHTML = ''; return;
    }
    if (s.status === 'signed_out' && dismissed()) {
      el.hidden = true; el.innerHTML = ''; return;
    }
    window.__kbOrigPaint();
    if (s.status === 'signed_out' && !el.hidden && !el.querySelector('[data-banner-x]')) {
      var x = document.createElement('button');
      x.setAttribute('data-banner-x', '1');
      x.setAttribute('aria-label', 'Dismiss');
      x.className = 'icon-btn';
      x.style.cssText = 'margin-left:auto;width:28px;height:28px;font-size:16px;line-height:1';
      x.textContent = 'x';
      x.onclick = function () { setDismissed(); el.hidden = true; el.innerHTML = ''; };
      el.appendChild(x);
    }
  };
  try { paintTrialBanner = paintTrialBanner; } catch (e) {}
  return true;
}

function hookAccount() {
  if (typeof applyAccount !== 'function' || window.__kbAccountHooked) return false;
  window.__kbAccountHooked = true;
  var orig = applyAccount;
  applyAccount = function (u) {
    var r = orig.apply(this, arguments);
    try {
      if (u || window.__kbAuthChecked) window.__kbAuthKnown = true;
      if (typeof paintTrialBanner === 'function') paintTrialBanner();
    } catch (e) {}
    return r;
  };
  try { applyAccount = applyAccount; } catch (e) {}
  return true;
}
function hookFetch() {
  if (window.__kbFetchHooked || typeof window.fetch !== 'function') return;
  window.__kbFetchHooked = true;
  var origFetch = window.fetch.bind(window);
  window.fetch = function (url, opts) {
    var s = String((url && url.url) || url || '');
    return origFetch(url, opts).then(function (r) {
      if (s.indexOf('/api/auth/me') >= 0 || s.indexOf('/api/premium/config') >= 0) {
        window.__kbAuthChecked = true;
      }
      return r;
    }, function (err) { throw err; });
  };
}
function revalidate(n) {
  if (n <= 0) return;
  setTimeout(function () {
    try {
      if (window.KingdomPremium && typeof window.KingdomPremium.load === 'function') {
        window.KingdomPremium.load().then(function (u) {
          try {
            window.__kbAuthChecked = true;
            window.__kbAuthKnown = true;
            if (typeof applyAccount === 'function') applyAccount(u || null);
            else if (typeof paintTrialBanner === 'function') paintTrialBanner();
          } catch (e) {}
          if (!u && n > 1) revalidate(n - 1);
        }, function () { revalidate(n - 1); });
      }
    } catch (e) {}
  }, 2500);
}
window.__kbAuthKnown = !!window.__kbAuthKnown;
hookFetch();
var tries = 0;
var iv = setInterval(function () {
  var a = wrap(), b = hookAccount();
  if ((a && b) || ++tries > 100) {
    clearInterval(iv);
    try {
      var el = banner();
      var s = (typeof accountState !== 'undefined') ? accountState : null;
      if (el && !el.hidden && s && s.status === 'signed_out' && !window.__kbAuthKnown) {
        el.hidden = true; el.innerHTML = '';
        revalidate(3);
      } else if (!window.__kbAuthKnown && (!s || s.status === 'signed_out')) {
        revalidate(2);
      }
    } catch (e) {}
  }
}, 100);
})();
