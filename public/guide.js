/**
 * KINGDOM BIBLE — glass guide.
 *
 * A frosted, searchable manual in the style of an Auro-style launcher popup.
 * It documents the live setup (vMix, OBS, phone remote) so a volunteer can set
 * up before the service instead of during it.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KBGuide = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TABS = [
    {
      id: 'start',
      label: 'Quick start',
      title: 'Live in four moves',
      html: `
        <p>KINGDOM BIBLE turns any screen into a Scripture display you control from your phone.</p>
        <ol class="glass-steps">
          <li>Open <b>Ministry Mode</b> in the app.</li>
          <li>Press <b>Phone remote</b> and open that address on your phone (same Wi-Fi).</li>
          <li>In OBS or vMix, add a browser source using the <b>browser-source URL</b> at <b>1920 × 1080</b>.</li>
          <li>On the phone, type a reference and press the big <b>NEXT</b> button. The screen follows.</li>
        </ol>
        <div class="glass-note">
          <b>Typing is forgiving.</b> <span class="glass-url">lk 3 23</span>,
          <span class="glass-url">jhn 3:16</span> and
          <span class="glass-url">1jhn 3 16</span> all resolve to the right verse.
        </div>
        <div class="glass-grid">
          <div class="glass-card"><h4>Royal Gold</h4><p>Default. Full-bleed background for a projector or stream.</p></div>
          <div class="glass-card"><h4>Classic Black</h4><p>Darker, lower glare for a dim room.</p></div>
          <div class="glass-card"><h4>Minimal White</h4><p>Bright background, good for daylight rooms.</p></div>
          <div class="glass-card"><h4>Transparent</h4><p>Overlay for OBS. Text only, so your video shows through.</p></div>
        </div>`
    },
    {
      id: 'vmix',
      label: 'vMix',
      title: 'vMix setup',
      html: `
        <p>vMix renders the page with its built-in Web Browser input, so the display updates as the remote sends new verses.</p>
        <ol class="glass-steps">
          <li>Copy the <b>browser-source URL</b> from Ministry Mode.</li>
          <li>In vMix choose <b>Add Input → Web Browser</b>.</li>
          <li>Paste the URL and set the resolution to <b>1920 × 1080</b>.</li>
          <li>Tick <b>Refresh browser when input is not live</b> so it reconnects if the stream drops.</li>
          <li>Name the input, for example <b>Scripture</b>, and place it in your rundown.</li>
          <li>Send verses from the phone remote. The Web Browser input follows automatically.</li>
        </ol>
        <div class="glass-note">
          vMix composites the page as-is, so use <b>Royal Gold</b> or <b>Classic Black</b> as a
          normal video input. Use <b>Transparent</b> only in OBS, which supports real alpha.
        </div>
        <div class="glass-note warn">
          <b>Keep the control page private.</b> The audience display at <span class="glass-url">/present</span>
          is safe to capture, because it shows no controls.
        </div>`
    },
    {
      id: 'obs',
      label: 'OBS',
      title: 'OBS setup',
      html: `
        <p>OBS has a Browser Source and real alpha compositing, so you can overlay Scripture over your camera and slides.</p>
        <ol class="glass-steps">
          <li>Copy the <b>browser-source URL</b> from Ministry Mode.</li>
          <li>In OBS choose <b>Sources → + → Browser</b>.</li>
          <li>Paste the URL, set <b>Width 1920</b> and <b>Height 1080</b>.</li>
          <li>Leave <b>Shutdown source when not visible</b> <b>unchecked</b> so it keeps receiving verses.</li>
          <li>Set <b>FPS 30</b> for smooth text, and leave the custom frame rate alone.</li>
          <li>Choose the <b>Transparent</b> theme to overlay the verse on top of your other sources.</li>
        </ol>
        <div class="glass-note">
          <b>Overlay tip.</b> Right-click the Browser source → <b>Transform → Fit to screen</b>, then
          hold <span class="glass-key">Ctrl</span> and drag to move it lower on the frame.
        </div>
        <div class="glass-note">
          <b>Bandwidth.</b> The first load fetches about 4 MB of Bible text. After that the page
          updates in place, so the stream stays light.
        </div>`
    },
    {
      id: 'phone',
      label: 'Phone remote',
      title: 'Controlling from your phone',
      html: `
        <p>Open the remote on your phone and it becomes the presenter console. The audience display follows whatever you send.</p>
        <div class="glass-grid">
          <div class="glass-card"><h4>NEXT VERSE</h4><p>The big gold button. Advances the passage.</p></div>
          <div class="glass-card"><h4>PREVIOUS</h4><p>Steps back to the previous passage.</p></div>
          <div class="glass-card"><h4>Block size</h4><p>Passage mode. Pick 3 to walk a passage a stanza at a time.</p></div>
          <div class="glass-card"><h4>Blank screen</h4><p>Clears the audience screen between points.</p></div>
        </div>
        <h3>Passage mode</h3>
        <p>Send <b>John 3:16-18</b>, then press NEXT. Instead of creeping forward one verse, the
        remote moves the whole block to <b>John 3:19-21</b>. This keeps your place and reads a
        passage at a natural pace.</p>
        <h3>Connecting reliably</h3>
        <p>For a fixed installation the most dependable setup is to run the app on the presenting
        computer with <span class="glass-url">npm start</span>. The phone and the display then both
        talk to that one server, so nothing can go out of step. The startup log prints the exact
        address to open on your phone.</p>`
    },
    {
      id: 'keys',
      label: 'Shortcuts',
      title: 'Keyboard shortcuts',
      html: `
        <p>These work anywhere in the main app.</p>
        <div class="glass-grid">
          <div class="glass-card"><h4><span class="glass-key">Ctrl</span> + <span class="glass-key">K</span></h4><p>Command search</p></div>
          <div class="glass-card"><h4><span class="glass-key">B</span></h4><p>Go to the Bible reader</p></div>
          <div class="glass-card"><h4><span class="glass-key">S</span></h4><p>Go to search</p></div>
          <div class="glass-card"><h4><span class="glass-key">P</span></h4><p>Go to Ministry Mode</p></div>
          <div class="glass-card"><h4><span class="glass-key">G</span></h4><p>Open this guide</p></div>
          <div class="glass-card"><h4><span class="glass-key">?</span></h4><p>Open this guide</p></div>
          <div class="glass-card"><h4><span class="glass-key">Esc</span></h4><p>Close any dialog</p></div>
        </div>
        <div class="glass-note">
          On the <b>phone remote</b>, the two large buttons sit in the thumb zone and the screen
          is kept awake, so you can hold the phone one-handed during a service.
        </div>`
    }
  ];

  /**
   * Normalize for searching by removing every non-alphanumeric character, so
   * punctuation and spacing differences never hide a result:
   *   "Wi-Fi"      -> "wifi"        matches a search for "wifi"
   *   "1920 × 1080"-> "19201080"    matches "1920x1080" and "1920 1080"
   *   "NEXT VERSE" -> "nextverse"   matches "next verse"
   */
  function norm(value) {
    return String(value == null ? '' : value)
      .toLowerCase()
      // "1920x1080", "1920 × 1080" and "1920 1080" should all collapse together.
      .replace(/(\d)\s*[x×]\s*(?=\d)/g, '$1')
      .replace(/[^a-z0-9]/g, '');
  }

  /** Flatten the guide so the search box can filter across every section. */
  function searchable() {
    return TABS.map((t) => ({
      id: t.id,
      label: t.label,
      title: t.title,
      text: norm(t.html.replace(/<[^>]+>/g, ' ')),
      raw: t.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
    }));
  }

  /** Which sections match a query, using the same normalization. */
  function filter(query) {
    const q = norm(query);
    if (!q) return TABS.slice();
    return TABS.filter((t) => {
      const s = searchable().find((x) => x.id === t.id);
      return s.text.includes(q) || norm(t.label).includes(q) || norm(t.title).includes(q);
    });
  }

  return { TABS, searchable, filter, norm };
});
