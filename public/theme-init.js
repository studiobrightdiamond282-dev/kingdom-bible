/* KINGDOM BIBLE — theme boot (external file so the Content-Security-Policy
   can stay strict: inline <script> is blocked by script-src 'self').
   Runs synchronously in <head> to avoid a light-flash before styles load. */
try {
  var kbp = JSON.parse(localStorage.getItem('kingdomBible.v1') || '{}');
  if (kbp && kbp.profile && kbp.profile.theme) document.documentElement.setAttribute('data-theme', kbp.profile.theme);
} catch (e) {}
