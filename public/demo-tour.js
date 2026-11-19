/* KINGDOM BIBLE — animated, accessible product walkthrough.
 * This is a code-built preview, not a prerecorded video. It uses isolated mock
 * screens so a tour never edits the reader's real notes, plans, or prayers. */
(function (root) {
  'use strict';

  const STEP_MS = 8200;
  const NAV = [
    ['home', '⌂', 'Home'], ['bible', '▤', 'Bible'], ['search', '⌕', 'Search'],
    ['study', '✦', 'Study'], ['plans', '◫', 'Plans'], ['prayer', '♧', 'Prayer'],
    ['ministry', '▣', 'Ministry']
  ];
  const STEPS = [
    {
      id: 'reader', nav: 'bible', feature: 'Bible reader', title: 'Read the Bible your way',
      description: 'Choose a book, chapter, and translation. Tap any verse to save it, highlight it, add a note, or open study tools.',
      route: 'bible', action: 'Open the Bible reader', screenTitle: 'Read Scripture',
      screenEyebrow: 'YOUR READING SPACE', pointer: {
        label: 'Choose a book or chapter', labelX: 72, labelY: 10,
        from: [800, 96], control: [650, 96], target: [420, 178]
      }
    },
    {
      id: 'search', nav: 'search', feature: 'Scripture search', title: 'Find a verse in seconds',
      description: 'Search the Bible by a word, phrase, or reference. Open a result to jump straight into its chapter.',
      route: 'search', action: 'Try Scripture search', screenTitle: 'Search Scripture',
      screenEyebrow: 'ALL 66 BOOKS', pointer: {
        label: 'Search a word, phrase, or verse', labelX: 65, labelY: 69,
        from: [710, 398], control: [690, 310], target: [565, 191]
      }
    },
    {
      id: 'study', nav: 'study', feature: 'Study tools', title: 'Go deeper without losing your place',
      description: 'Keep a verse, a personal note, and related study actions together. Your notes and saved passages stay on this device.',
      route: 'study', action: 'Open Study Mode', screenTitle: 'Study with context',
      screenEyebrow: 'VERSE TO INSIGHT', pointer: {
        label: 'Save, note, compare, or study', labelX: 72, labelY: 10,
        from: [810, 94], control: [690, 148], target: [520, 317]
      }
    },
    {
      id: 'plans', nav: 'plans', feature: 'Reading plans', title: 'Build a steady reading rhythm',
      description: 'Choose a guided plan, read the day’s passage, and see your progress at a glance. Move at a pace that works for you.',
      route: 'plans', action: 'Browse reading plans', screenTitle: 'Reading plans',
      screenEyebrow: 'A GENTLE DAILY RHYTHM', pointer: {
        label: 'See today’s progress', labelX: 70, labelY: 69,
        from: [740, 422], control: [660, 368], target: [544, 271]
      }
    },
    {
      id: 'prayer', nav: 'prayer', feature: 'Prayer journal', title: 'Keep your prayer life close',
      description: 'Write a prayer, mark its status, and return to it later. Prayer entries are saved locally in this browser.',
      route: 'prayer', action: 'Open the prayer journal', screenTitle: 'Prayer journal',
      screenEyebrow: 'PRIVATE · SCRIPTURE-CENTERED', pointer: {
        label: 'Start a new prayer', labelX: 55, labelY: 38,
        from: [705, 229], control: [790, 194], target: [865, 148]
      }
    },
    {
      id: 'ministry', nav: 'ministry', feature: 'Ministry mode', title: 'Present Scripture to a room',
      description: 'Prepare a clean audience display, change the look, and control the passage from the presenter screen. Live syncing needs a connected ministry hub.',
      route: 'ministry', action: 'Explore Ministry Mode', screenTitle: 'Ministry mode',
      screenEyebrow: 'PRESENTER PREVIEW', pointer: {
        label: 'Open the audience display', labelX: 65, labelY: 68,
        from: [760, 410], control: [820, 344], target: [843, 230]
      }
    },
    {
      id: 'tools', nav: 'study', feature: 'Premium tools', title: 'Bring your study and ministry together',
      description: 'Explore focused study, translation comparison, voice reading, and hands-free presentation tools. Availability can depend on your account and live-service setup.',
      route: 'study', action: 'Explore study tools', screenTitle: 'Tools for deeper study',
      screenEyebrow: 'STUDY · LISTEN · PRESENT', pointer: {
        label: 'Explore the available tools', labelX: 69, labelY: 10,
        from: [820, 98], control: [815, 164], target: [733, 295]
      }
    }
  ];

  const SCENES = {
    reader: `
      <div class="demo-toolbar-row">
        <span class="demo-select-pill"><small>BOOK</small><strong>John <b>⌄</b></strong></span>
        <span class="demo-select-pill"><small>CHAPTER</small><strong>3 <b>⌄</b></strong></span>
        <span class="demo-select-pill"><small>VERSION</small><strong>KJV <b>⌄</b></strong></span>
      </div>
      <div class="demo-scripture-card">
        <div class="demo-ref">JOHN 3 · KING JAMES VERSION</div>
        <p><sup>16</sup> For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.</p>
        <div class="demo-inline-actions"><span>♡ Save</span><span>✎ Note</span><span>◫ Compare</span></div>
      </div>`,
    search: `
      <div class="demo-search-field"><span>⌕</span><strong>faith</strong><span class="demo-search-key">Search</span></div>
      <div class="demo-results-label">TOP MATCHES <span>3 results shown</span></div>
      <div class="demo-result"><strong>Hebrews 11:1</strong><p>Now faith is the substance of things hoped for, the evidence of things not seen.</p></div>
      <div class="demo-result"><strong>Romans 10:17</strong><p>So then faith cometh by hearing, and hearing by the word of God.</p></div>
      <div class="demo-result demo-result-muted"><strong>2 Corinthians 5:7</strong><p>For we walk by faith, not by sight.</p></div>`,
    study: `
      <div class="demo-verse-focus"><div class="demo-ref">SELECTED PASSAGE · JOHN 3:16</div><p>“For God so loved the world…”</p><div class="demo-inline-actions demo-tool-actions"><span>♡ Save</span><span>▰ Highlight</span><span>✎ Add note</span><span>✦ Study</span></div></div>
      <div class="demo-study-grid"><div><small>RELATED PASSAGE</small><strong>Romans 5:8</strong></div><div><small>YOUR NOTE</small><strong>Remember the gift of grace</strong></div></div>`,
    plans: `
      <div class="demo-plan-card"><div class="demo-plan-top"><div><small>YOUR CURRENT PLAN</small><strong>Bible in One Year</strong></div><span class="demo-progress-badge">DAY 38 / 365</span></div>
        <div class="demo-plan-track"><i></i></div><div class="demo-plan-foot"><span>10% complete</span><span>Today · Exodus 12–14</span></div>
      </div>
      <div class="demo-next-reading"><span class="demo-next-icon">◫</span><div><small>UP NEXT</small><strong>Continue today’s reading</strong></div><span class="demo-next-arrow">→</span></div>`,
    prayer: `
      <div class="demo-prayer-top"><div><small>YOUR JOURNAL</small><strong>Prayer journal</strong></div><span class="demo-new-prayer">＋ New prayer</span></div>
      <div class="demo-prayer-card"><span class="demo-prayer-dot"></span><div><strong>Wisdom for today</strong><p>Help me choose the next faithful step and trust Your guidance.</p><small>PERSONAL · WAITING</small></div></div>
      <div class="demo-private-note">🔒 Saved on this device · Your private entries stay in this browser.</div>`,
    ministry: `
      <div class="demo-ministry-top"><div><small>LIVE PRESENTATION PREVIEW</small><strong>Scripture for the room</strong></div><span class="demo-live-badge"><i></i> PREVIEW</span></div>
      <div class="demo-display-card"><small>PSALM 23:1 · KJV</small><p>“The LORD is my shepherd; I shall not want.”</p><span>KINGDOM BIBLE</span></div>
      <div class="demo-present-actions"><span>← Previous</span><span class="demo-open-display">▣ Open audience display</span><span>Next →</span></div>`,
    tools: `
      <div class="demo-premium-grid">
        <div class="demo-premium-card demo-premium-highlight"><span>✦</span><small>STUDY</small><strong>Ask about a passage</strong><p>Explore Scripture with context and cross references.</p></div>
        <div class="demo-premium-card"><span>◉</span><small>LISTEN</small><strong>Read aloud</strong><p>Listen to the text while you follow along.</p></div>
        <div class="demo-premium-card"><span>▣</span><small>MINISTRY</small><strong>Present with confidence</strong><p>Prepare a clear audience display for your service.</p></div>
      </div>
      <div class="demo-service-note">A guided preview only — no account or personal data is changed.</div>`
  };

  let overlayRoot = null;
  let keyHandler = null;
  let timer = null;
  let playing = false;
  let index = 0;
  let remainingMs = STEP_MS;
  let startedAt = 0;
  let returnFocus = null;

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  }

  function screenHtml(step) {
    const scene = SCENES[step.id] || '';
    return `<div class="demo-mock-window" aria-hidden="true">
      <div class="demo-mock-chrome"><span class="demo-chrome-dots"><i></i><i></i><i></i></span><span class="demo-chrome-title">KINGDOM BIBLE <b>·</b> ${escapeHtml(step.feature)}</span><span class="demo-chrome-profile">S</span></div>
      <div class="demo-mock-body"><aside class="demo-mock-rail"><div class="demo-mock-brand">K</div>${NAV.map(([id, icon, label]) => `<div class="demo-mock-nav ${id === step.nav ? 'is-active' : ''}"><span>${icon}</span><small>${label}</small></div>`).join('')}<div class="demo-mock-profile"><i>S</i><span>Local profile</span></div></aside>
        <section class="demo-mock-main"><div class="demo-mock-pagehead"><div><small>${escapeHtml(step.screenEyebrow)}</small><strong>${escapeHtml(step.screenTitle)}</strong></div><span class="demo-mock-user">Stanley <b>⌄</b></span></div><div class="demo-mock-content">${scene}</div></section>
      </div>
    </div>`;
  }

  function pointerHtml(step) {
    const p = step.pointer;
    const [sx, sy] = p.from, [cx, cy] = p.control, [tx, ty] = p.target;
    const path = `M ${sx} ${sy} Q ${cx} ${cy} ${tx} ${ty}`;
    return `<div class="demo-pointer-layer" aria-hidden="true">
      <svg class="demo-pointer-svg" viewBox="0 0 1000 560" preserveAspectRatio="none" focusable="false">
        <defs><marker id="demo-arrow-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor"></path></marker></defs>
        <path class="demo-pointer-path" d="${path}" marker-end="url(#demo-arrow-head)"></path>
      </svg>
      <span class="demo-target-ring" style="left:${(tx / 10).toFixed(2)}%;top:${(ty / 5.6).toFixed(2)}%"></span>
      <span class="demo-pointer-label" style="left:${p.labelX}%;top:${p.labelY}%"><i>FOLLOW THE ARROW</i><strong>${escapeHtml(p.label)}</strong></span>
    </div>`;
  }

  function modalHtml() {
    return `<div class="modal-backdrop demo-backdrop" data-demo-backdrop>
      <section class="modal demo-modal" role="dialog" aria-modal="true" aria-labelledby="demoTitle" aria-describedby="demoDescription">
        <header class="demo-modal-head"><div><span class="eyebrow">KINGDOM BIBLE · GUIDED DEMO</span><h2 id="demoModalHeading">A one-minute tour of the tools</h2><p>Follow the arrow, learn what each feature does, then open it to try it yourself.</p></div><button class="close-btn demo-close" type="button" data-demo-action="close" aria-label="Close demo">×</button></header>
        <div class="demo-tour-progress" role="progressbar" aria-label="Tour progress" aria-valuemin="1" aria-valuemax="${STEPS.length}" aria-valuenow="1" aria-valuetext="Step 1 of ${STEPS.length}"><span id="demoTourProgressFill"></span></div>
        <div class="demo-player-wrap"><div class="demo-canvas" id="demoCanvas"></div></div>
        <div class="demo-caption" aria-live="polite" aria-atomic="true"><div><div class="demo-caption-meta"><span id="demoFeature"></span><span id="demoStepCount"></span></div><h3 id="demoTitle"></h3><p id="demoDescription"></p></div><button class="secondary-btn demo-try" type="button" id="demoTry">Open this feature →</button></div>
        <div class="demo-controls"><div class="demo-step-dots" id="demoStepDots" aria-label="Choose a demo step"></div><div class="demo-play-track" aria-hidden="true"><span id="demoPlayProgressFill"></span></div><div class="demo-buttons"><button class="secondary-btn small-btn" type="button" data-demo-action="previous" aria-label="Previous step">← <span>Back</span></button><button class="primary-btn small-btn demo-play" type="button" data-demo-action="toggle" aria-pressed="true"><span id="demoPlayLabel">Ⅱ Pause</span></button><button class="secondary-btn small-btn" type="button" data-demo-action="next" aria-label="Next step"><span>Next</span> →</button></div></div>
        <p class="demo-disclaimer">Interactive preview · Uses sample screens only; it will not change your reading progress, notes, or prayers.</p>
      </section>
    </div>`;
  }

  function render() {
    if (!overlayRoot) return;
    const step = STEPS[index];
    const canvas = overlayRoot.querySelector('#demoCanvas');
    if (canvas) canvas.innerHTML = screenHtml(step) + pointerHtml(step);
    overlayRoot.querySelector('#demoFeature').textContent = step.feature;
    overlayRoot.querySelector('#demoStepCount').textContent = `STEP ${index + 1} OF ${STEPS.length}`;
    overlayRoot.querySelector('#demoTitle').textContent = step.title;
    overlayRoot.querySelector('#demoDescription').textContent = step.description;
    const progress = overlayRoot.querySelector('.demo-tour-progress');
    progress.setAttribute('aria-valuenow', String(index + 1));
    progress.setAttribute('aria-valuetext', `Step ${index + 1} of ${STEPS.length}`);
    overlayRoot.querySelector('#demoTourProgressFill').style.width = `${((index + 1) / STEPS.length) * 100}%`;
    const tryButton = overlayRoot.querySelector('#demoTry');
    tryButton.dataset.route = step.route;
    tryButton.textContent = `${step.action} →`;
    const dots = overlayRoot.querySelector('#demoStepDots');
    dots.innerHTML = STEPS.map((item, i) => `<button type="button" class="demo-dot ${i === index ? 'is-active' : ''}" data-demo-index="${i}" aria-label="Go to ${escapeHtml(item.feature)}" aria-current="${i === index ? 'step' : 'false'}"><span></span></button>`).join('');
    const prev = overlayRoot.querySelector('[data-demo-action="previous"]');
    const next = overlayRoot.querySelector('[data-demo-action="next"]');
    prev.disabled = index === 0;
    next.disabled = index === STEPS.length - 1;
    resetPlaybackProgress();
    updatePlayButton();
  }

  function resetPlaybackProgress() {
    const fill = overlayRoot?.querySelector('#demoPlayProgressFill');
    if (!fill) return;
    fill.style.transition = 'none';
    fill.style.width = '0%';
    if (playing) startProgressAnimation(fill);
  }

  function startProgressAnimation(fill) {
    const duration = Math.max(0, remainingMs);
    fill.style.transition = 'none';
    fill.style.width = `${((STEP_MS - duration) / STEP_MS) * 100}%`;
    void fill.offsetWidth;
    fill.style.transition = `width ${duration}ms linear`;
    fill.style.width = '100%';
  }

  function updatePlayButton() {
    const button = overlayRoot?.querySelector('[data-demo-action="toggle"]');
    const label = overlayRoot?.querySelector('#demoPlayLabel');
    if (!button || !label) return;
    label.textContent = playing ? 'Ⅱ Pause' : (index === STEPS.length - 1 ? '↻ Replay tour' : '▶ Play tour');
    button.setAttribute('aria-pressed', String(playing));
  }

  function stopTimer() {
    if (timer) clearTimeout(timer);
    timer = null;
  }

  function startPlayback() {
    if (!overlayRoot) return;
    if (index === STEPS.length - 1) {
      index = 0;
      remainingMs = STEP_MS;
      render();
    }
    playing = true;
    startedAt = Date.now();
    updatePlayButton();
    const fill = overlayRoot.querySelector('#demoPlayProgressFill');
    if (fill) startProgressAnimation(fill);
    timer = setTimeout(() => {
      timer = null;
      if (index < STEPS.length - 1) {
        index += 1;
        remainingMs = STEP_MS;
        render();
        startPlayback();
      } else {
        playing = false;
        remainingMs = STEP_MS;
        updatePlayButton();
      }
    }, remainingMs);
  }

  function pausePlayback() {
    if (!playing) return;
    stopTimer();
    remainingMs = Math.max(0, remainingMs - (Date.now() - startedAt));
    playing = false;
    const fill = overlayRoot?.querySelector('#demoPlayProgressFill');
    if (fill) {
      const elapsed = Math.max(0, STEP_MS - remainingMs);
      fill.style.transition = 'none';
      fill.style.width = `${(elapsed / STEP_MS) * 100}%`;
    }
    updatePlayButton();
  }

  function goTo(nextIndex) {
    const wasPlaying = playing;
    stopTimer();
    playing = false;
    index = Math.max(0, Math.min(STEPS.length - 1, nextIndex));
    remainingMs = STEP_MS;
    render();
    if (wasPlaying) startPlayback();
  }

  function handleClick(event) {
    const action = event.target.closest('[data-demo-action]')?.dataset.demoAction;
    if (action === 'close') return close();
    if (action === 'toggle') return playing ? pausePlayback() : startPlayback();
    if (action === 'previous') return goTo(index - 1);
    if (action === 'next') return goTo(index + 1);
    const dot = event.target.closest('[data-demo-index]');
    if (dot) return goTo(Number(dot.dataset.demoIndex));
    if (event.target === overlayRoot.querySelector('[data-demo-backdrop]')) close();
  }

  function handleKey(event) {
    if (!overlayRoot) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    const target = event.target;
    const inFormControl = target && target.matches && target.matches('input,textarea,select,[contenteditable="true"]');
    if (!inFormControl && event.key === 'ArrowRight') {
      event.preventDefault();
      goTo(index + 1);
    } else if (!inFormControl && event.key === 'ArrowLeft') {
      event.preventDefault();
      goTo(index - 1);
    }
    if (event.key === 'Tab') {
      const dialog = overlayRoot.querySelector('.demo-modal');
      const focusable = [...dialog.querySelectorAll('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }

  function open() {
    close();
    index = 0;
    remainingMs = STEP_MS;
    playing = false;
    returnFocus = document.activeElement;
    const mount = document.getElementById('modalRoot');
    if (!mount) return;
    mount.innerHTML = modalHtml();
    overlayRoot = mount;
    overlayRoot.addEventListener('click', handleClick);
    keyHandler = handleKey;
    document.addEventListener('keydown', keyHandler);
    render();
    overlayRoot.querySelector('[data-demo-action="close"]').focus();
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduceMotion) startPlayback();
  }

  function dispose(options) {
    stopTimer();
    playing = false;
    if (keyHandler) document.removeEventListener('keydown', keyHandler);
    if (overlayRoot) overlayRoot.removeEventListener('click', handleClick);
    keyHandler = null;
    overlayRoot = null;
    const restore = options?.restoreFocus !== false;
    const focus = returnFocus;
    returnFocus = null;
    if (restore && focus && focus.isConnected) setTimeout(() => focus.focus(), 0);
  }

  function close() {
    const mount = document.getElementById('modalRoot');
    dispose({ restoreFocus: true });
    if (mount) mount.innerHTML = '';
  }

  root.KingdomDemo = Object.freeze({ open, close, dispose, steps: STEPS.map(step => ({ ...step, pointer: { ...step.pointer } })) });
})(window);
