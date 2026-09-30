/**
 * KINGDOM BIBLE — live presentation engine.
 *
 * Two concerns, kept separate on purpose:
 *
 *  1. Pure passage arithmetic (stepPassage), which decides where NEXT and
 *     PREVIOUS land. No DOM, no network, so it can be unit tested.
 *  2. The transport that keeps a presenter remote and an audience display in
 *     sync across tabs and devices.
 *
 * Passage mode is what makes this more capable than a basic teleprompter:
 * send John 3:16-18, press NEXT, and it advances to 3:19-21 — keeping the
 * same size block instead of creeping forward one verse at a time.
 *
 * Works as a browser global (window.KBLive) and under Node for tests.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KBLive = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CHANNEL = 'kingdom-presentation';
  const LOCAL_KEY = 'kingdomPresentation';

  /** How many verses the current passage covers (1 when it is a single verse). */
  function spanOf(pos) {
    if (!pos) return 1;
    const end = Number.isFinite(pos.verseEnd) && pos.verseEnd >= pos.verse ? pos.verseEnd : pos.verse;
    return Math.max(1, end - pos.verse + 1);
  }

  /**
   * Verses run continuously through a book, so a move is computed as a flat
   * index and converted back. That is what makes crossing a chapter boundary
   * with a long passage behave correctly.
   */
  function toIndex(chapter, verse, sizes) {
    let idx = 0;
    for (let c = 1; c < chapter; c++) idx += sizes[c - 1] || 0;
    return idx + (verse - 1);
  }

  function fromIndex(idx, sizes) {
    let c = 0;
    while (c < sizes.length && idx >= sizes[c]) {
      idx -= sizes[c];
      c++;
    }
    return { chapter: c + 1, verse: idx + 1 };
  }

  /**
   * Where NEXT (+1) or PREVIOUS (-1) should land.
   *
   * @param {object}   pos       { book, chapter, verse, verseEnd }
   * @param {number}   delta     +1 or -1
   * @param {number}  [span]     verses to move by; defaults to the current span
   * @param {number[]} sizes     verse count of every chapter in the book
   * @returns {object|null} { chapter, verse, verseEnd, wrapped } or null at a
   *   hard boundary (before the first verse, or past the last verse)
   */
  function stepPassage(pos, delta, span, sizes) {
    if (!pos || !Array.isArray(sizes) || !sizes.length) return null;
    const size = Math.max(1, span || spanOf(pos));
    const total = sizes.reduce((a, b) => a + b, 0);
    const verseEnd =
      Number.isFinite(pos.verseEnd) && pos.verseEnd >= pos.verse ? pos.verseEnd : pos.verse;

    // NEXT begins immediately after the current block ENDS, and PREVIOUS ends
    // immediately before the current block BEGINS. Measuring from the block's
    // start instead would skip verses whenever a block was trimmed at a
    // chapter end — pressing NEXT on John 3:35-36 would jump past 4:1.
    const target =
      delta >= 0
        ? toIndex(pos.chapter, verseEnd, sizes) + 1
        : toIndex(pos.chapter, pos.verse, sizes) - size;

    if (target < 0 || target >= total) return null; // hit a book boundary

    const at = fromIndex(target, sizes);
    const chapterLen = sizes[at.chapter - 1] || 1;
    return {
      chapter: at.chapter,
      verse: at.verse,
      verseEnd: Math.min(at.verse + size - 1, chapterLen),
      wrapped: at.chapter !== pos.chapter
    };
  }

  /** Clamp a requested passage to verses that actually exist. */
  function clampPassage(pos, sizes) {
    if (!pos) return null;
    const chapterLen = (sizes && sizes[pos.chapter - 1]) || pos.verseEnd || pos.verse;
    const verse = Math.min(Math.max(1, pos.verse), chapterLen);
    const verseEnd = Math.min(Math.max(verse, pos.verseEnd || verse), chapterLen);
    return { chapter: pos.chapter, verse, verseEnd };
  }

  function readLocal() {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function writeLocal(payload) {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(payload));
    } catch {
      /* private mode: the server and BroadcastChannel still carry updates */
    }
  }

  /**
   * Current payload. Prefers the server so a second device shows the same
   * verse, and falls back to this device's own copy when offline.
   */
  async function get() {
    try {
      const res = await fetch('/api/presentation', { headers: { accept: 'application/json' } });
      if (res.ok) {
        const data = await res.json();
        if (data && data.text) return data;
      }
    } catch {
      /* offline or blocked: fall through */
    }
    return readLocal();
  }

  /**
   * Publish to every listener: this tab, other tabs on this device, and any
   * other device through the server.
   */
  async function send(payload) {
    const clean = { ...payload, ts: Date.now() };
    writeLocal(clean);
    try {
      new BroadcastChannel(CHANNEL).postMessage(clean);
    } catch {
      /* older browser: the storage event still fires */
    }
    try {
      await fetch('/api/presentation', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(clean)
      });
    } catch {
      /* local copies are already updated */
    }
    return clean;
  }

  /**
   * Listen for updates from the server, other tabs, and local storage.
   * Duplicate frames are dropped so a display never re-renders needlessly.
   *
   * @param {function(object):void} onPayload
   * @param {object} [opts] { pollMs } enables polling, which keeps a display in
   *   step on hosts where the event stream is time-boxed
   * @returns {function():void} unsubscribe
   */
  function subscribe(onPayload, opts) {
    const options = opts || {};
    let last = '';

    const deliver = (p) => {
      if (!p) return;
      const stamp = [p.ts, p.ref, p.text, p.blank ? '1' : '0', p.theme].join('|');
      if (stamp === last) return;
      last = stamp;
      onPayload(p);
    };

    try {
      const bc = new BroadcastChannel(CHANNEL);
      bc.onmessage = (e) => deliver(e.data);
    } catch {
      /* not supported */
    }

    window.addEventListener('storage', (e) => {
      if (e.key === LOCAL_KEY && e.newValue) {
        try {
          deliver(JSON.parse(e.newValue));
        } catch {
          /* ignore malformed */
        }
      }
    });

    let es = null;
    try {
      es = new EventSource('/api/presentation/events');
      es.onmessage = (e) => {
        try {
          deliver(JSON.parse(e.data));
        } catch {
          /* ignore malformed frame */
        }
      };
    } catch {
      /* not supported */
    }

    let timer = null;
    if (options.pollMs) {
      timer = setInterval(async () => {
        const p = await get();
        if (p) deliver(p);
      }, options.pollMs);
    }

    return () => {
      try {
        if (es) es.close();
      } catch {
        /* ignore */
      }
      if (timer) clearInterval(timer);
    };
  }

  return {
    stepPassage,
    spanOf,
    clampPassage,
    toIndex,
    fromIndex,
    get,
    send,
    subscribe,
    readLocal,
    writeLocal,
    CHANNEL,
    LOCAL_KEY
  };
});
