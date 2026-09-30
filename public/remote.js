/**
 * KINGDOM BIBLE — live remote.
 *
 * The phone side of Ministry Mode. It publishes to the same presentation
 * payload the audience display renders, so a preacher can drive a projector, a
 * vMix Web Browser input, or an OBS Browser Source from their pocket.
 *
 * Reference entry reuses the same fuzzy parser as the main app, so "lk 3 23",
 * "jhn 3:16" and "1jhn 3 16" all work here too.
 */
'use strict';

const TR = { kjv: 'KJV', ylt: 'YLT', asv: 'ASV', web: 'WEB', bbe: 'Basic English' };
const LS = 'kingdomBible.liveRemote.v1';

const $ = (s) => document.querySelector(s);
const esc = (s) =>
  String(s == null ? '' : s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );

let books = [];
let refIndex = null;
let settings = { span: 1, translation: 'kjv', theme: 'royal', church: 'KINGDOM BIBLE' };
let current = null;
const bookCache = new Map();
let timerId = null;
let timerSec = 0;
let wakeLock = null;

function loadSettings() {
  try {
    Object.assign(settings, JSON.parse(localStorage.getItem(LS) || '{}'));
  } catch {
    /* defaults are fine */
  }
}
function saveSettings() {
  try {
    localStorage.setItem(LS, JSON.stringify(settings));
  } catch {
    /* private mode */
  }
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 1900);
}

function buzz(ms) {
  try {
    if (navigator.vibrate) navigator.vibrate(ms || 12);
  } catch {
    /* not supported */
  }
}

function fmtTimer(s) {
  const h = String(Math.floor(s / 3600)).padStart(2, '0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const sec = String(s % 60).padStart(2, '0');
  return `${h}:${m}:${sec}`;
}

/* ---------- scripture ---------- */

async function loadBook(tr, bi) {
  const key = `${tr}:${bi}`;
  if (bookCache.has(key)) return bookCache.get(key);
  const res = await fetch(`/data/bibles/${tr}/${bi}.json`);
  if (!res.ok) throw new Error(`Could not load ${tr} book ${bi}`);
  const data = await res.json();
  bookCache.set(key, data);
  return data;
}

/** Verse count of every chapter in a book, needed to step across boundaries. */
async function chapterSizes(tr, bi) {
  const data = await loadBook(tr, bi);
  return data.chapters.map((c) => c.length);
}

/** Build the text for a position, joining the block when verseEnd > verse. */
async function verseAt(pos, tr) {
  const data = await loadBook(tr, pos.book);
  const chapters = data.chapters[pos.chapter - 1] || [];
  let text = chapters[pos.verse - 1] || '';
  if (pos.verseEnd > pos.verse) {
    text = chapters.slice(pos.verse - 1, pos.verseEnd).filter(Boolean).join(' ');
  }
  const name = books[pos.book] ? books[pos.book].name : '';
  return {
    ...pos,
    text,
    translation: tr,
    ref:
      pos.verseEnd > pos.verse
        ? `${name} ${pos.chapter}:${pos.verse}-${pos.verseEnd}`
        : `${name} ${pos.chapter}:${pos.verse}`
  };
}

/** Parse loose input such as "luk 3 23" with the shared parser. */

/* ---------- publishing ---------- */

async function publish(pos, opts) {
  const options = opts || {};
  const verse = await verseAt(pos, settings.translation);
  if (!verse.text) {
    toast('That verse has no text in this translation');
    return null;
  }
  current = verse;
  await KBLive.send({
    text: verse.text,
    ref: verse.ref,
    translation: settings.translation,
    theme: settings.theme,
    church: settings.church,
    blank: Boolean(options.blank)
  });
  paint();
  buzz(options.blank ? 25 : 12);
  return verse;
}

/** Re-send the current passage, e.g. after a translation or theme change. */
async function republish() {
  if (!current) return;
  await publish({
    book: current.book,
    chapter: current.chapter,
    verse: current.verse,
    verseEnd: current.verseEnd
  });
}

async function step(delta) {
  if (!current) {
    toast('Send a passage first');
    return;
  }
  const sizes = await chapterSizes(settings.translation, current.book);
  const next = KBLive.stepPassage(current, delta, settings.span, sizes);
  if (!next) {
    const name = books[current.book] ? books[current.book].name : 'book';
    toast(delta > 0 ? 'End of ' + name : 'Start of ' + name);
    buzz(40);
    return;
  }
  await publish({ book: current.book, ...next });
  toast(next.ref);
}

/* ---------- painting ---------- */

function paint() {
  if (!current) return;
  $('#nowCard').classList.toggle('blank', Boolean(current.blank));
  $('#nowText').textContent = current.blank ? '' : current.text;
  $('#nowMeta').textContent = `${current.ref} · ${TR[current.translation] || current.translation}`;
  $('#onScreenRef').textContent = current.ref;
  $('#nextLabel').textContent = settings.span > 1 ? `NEXT ${settings.span} VERSES` : 'NEXT VERSE';
  $('#linkDot').className = 'dot on';
}

/* ---------- suggestions ---------- */

function renderSuggestions(input) {
  const list = $('#sugg');
  const items = refIndex
    ? KBRef.suggest(input, { index: refIndex, contextBook: current ? current.book : undefined, limit: 6 })
    : [];
  if (!items.length) {
    list.hidden = true;
    list.innerHTML = '';
    return;
  }
  list.hidden = false;
  list.innerHTML = items
    .map((s, i) => {
      const abbr = books[s.book] ? books[s.book].abbr : '';
      return `<li data-i="${i}">${esc(s.label)}<span>${esc(abbr)}</span></li>`;
    })
    .join('');
  Array.from(list.children).forEach((li) => {
    li.onclick = async () => {
      const s = items[+li.dataset.i];
      $('#refInput').value = s.label;
      list.hidden = true;
      const pos = await resolveReference(s.label);
      if (pos) {
        await publish(pos);
        toast(pos.ref);
      } else {
        toast('Reference not found');
      }
    };
  });
}

/* ---------- timer and wake lock ---------- */

function drawTimer() {
  $('#timerOut').textContent = fmtTimer(timerSec);
}

function toggleTimer() {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
    $('#timerToggle').textContent = 'Start';
    return;
  }
  timerId = setInterval(() => {
    timerSec++;
    drawTimer();
  }, 1000);
  $('#timerToggle').textContent = 'Pause';
  buzz();

/* ---------- startup ---------- */

async function init() {
  loadSettings();

  try {
    books = (await (await fetch('/data/books.json')).json()).books;
    refIndex = KBRef.createIndex(books);
  } catch {
    toast('Could not load the Bible library');
    return;
  }

  $('#translation').innerHTML = Object.entries(TR)
    .map(([k, v]) => `<option value="${k}">${v}</option>`)
    .join('');
  $('#translation').value = settings.translation;
  $('#theme').value = settings.theme;
  $('#church').value = settings.church;
  $('#nextLabel').textContent = settings.span > 1 ? `NEXT ${settings.span} VERSES` : 'NEXT VERSE';
  drawTimer();

  // Adopt whatever is already on the display, so the remote opens in step with
  // the congregation rather than blank.
  const existing = await KBLive.get();
  if (existing && existing.text) {
    const p = parseLoose(existing.ref);
    if (p) {
      current = {
        book: p.book,
        chapter: p.chapter,
        verse: p.verse,
        verseEnd: p.verseEnd,
        text: existing.text,
        ref: existing.ref,
        translation: existing.translation || settings.translation,
        blank: existing.blank
      };
      settings.theme = existing.theme || settings.theme;
      settings.church = existing.church || settings.church;
      $('#theme').value = settings.theme;
      $('#church').value = settings.church;
      $('#translation').value = settings.translation = current.translation;
      paint();
    }
  }

  // Follow changes made anywhere else: the desktop app, another remote, OBS.
  KBLive.subscribe((payload) => {
    if (!payload || !payload.text) return;
    const p = parseLoose(payload.ref);
    if (!p) return;
    const same =
      current && p.book === current.book && p.chapter === current.chapter && p.verse === current.verse;
    if (same) {
      current.blank = payload.blank;
      paint();
      return;
    }
    current = {
      book: p.book,
      chapter: p.chapter,
      verse: p.verse,
      verseEnd: p.verseEnd,
      text: payload.text,
      ref: payload.ref,
      translation: payload.translation,
      blank: payload.blank
    };
    paint();
  });

  keepAwake();
  window.addEventListener('online', () => ($('#linkDot').className = 'dot on'));
  window.addEventListener('offline', () => ($('#linkDot').className = 'dot off'));
}

/* ---------- events ---------- */

$('#refForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const value = $('#refInput').value.trim();
  if (!value) return;
  $('#sugg').hidden = true;
  const pos = await resolveReference(value);
  if (!pos) {
    toast('Try a reference like "lk 3 23"');
    return;
  }
  await publish(pos);
  $('#refInput').value = '';
  toast(pos.ref);
});

$('#refInput').addEventListener('input', (e) => renderSuggestions(e.target.value));
$('#refInput').addEventListener('blur', () => setTimeout(() => ($('#sugg').hidden = true), 180));

Array.from(document.querySelectorAll('[data-go]')).forEach((chip) => {
  chip.onclick = async () => {
    const pos = await resolveReference(chip.dataset.go);
    if (pos) {
      await publish(pos);
      toast(pos.ref);
    }
  };
});

const spanButtons = Array.from(document.querySelectorAll('#spans button'));
spanButtons.forEach((btn) => {
  if (Number(btn.dataset.span) === settings.span) {
    spanButtons.forEach((b) => b.classList.remove('on'));
    btn.classList.add('on');
  }
  btn.onclick = () => {
    spanButtons.forEach((b) => b.classList.remove('on'));
    btn.classList.add('on');
    settings.span = Number(btn.dataset.span);
    saveSettings();
    $('#nextLabel').textContent = settings.span > 1 ? `NEXT ${settings.span} VERSES` : 'NEXT VERSE';
    buzz();
  };
});

$('#translation').onchange = (e) => {
  settings.translation = e.target.value;
  saveSettings();
  republish();
};
$('#theme').onchange = (e) => {
  settings.theme = e.target.value;
  saveSettings();
  republish();
};
$('#church').onchange = (e) => {
  settings.church = e.target.value.trim() || 'KINGDOM BIBLE';
  saveSettings();
  republish();
};

$('#blankBtn').onclick = async () => {
  if (!current) {
    toast('Send a passage first');
    return;
  }
  await publish(
    { book: current.book, chapter: current.chapter, verse: current.verse, verseEnd: current.verseEnd },
    { blank: !current.blank }
  );
  toast(current.blank ? 'Screen blanked' : 'Scripture shown');
};

$('#copyUrlBtn').onclick = async () => {
  const url = location.origin + '/present';
  try {
    await navigator.clipboard.writeText(url);
    toast('Display URL copied');
  } catch {
    toast(url);
  }
};

$('#timerToggle').onclick = toggleTimer;
$('#timerReset').onclick = () => {
  timerSec = 0;
  drawTimer();
  buzz();
};

$('#nextBtn').onclick = () => step(1);
$('#prevBtn').onclick = () => step(-1);

init();
}

async function keepAwake() {
  try {
    if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
  } catch {
    /* unsupported or denied: the screen may dim, which is acceptable */
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !wakeLock) keepAwake();
});

function parseLoose(input) {
  if (!refIndex) return null;
  return KBRef.parse(input, { index: refIndex, contextBook: current ? current.book : undefined });
}

/** Resolve a reference string to a position, clamped to verses that exist. */
async function resolveReference(input) {
  const p = parseLoose(input);
  if (!p) return null;
  const sizes = await chapterSizes(settings.translation, p.book);
  const clamped = KBLive.clampPassage(p, sizes);
  if (!clamped) return null;
  return verseAt({ book: p.book, ...clamped }, settings.translation);
}
