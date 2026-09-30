/**
 * KINGDOM BIBLE — Scripture reference parser.
 *
 * Turns loose, shorthand input into a canonical book/chapter/verse, the way
 * people actually type: "lk 3 23", "luk3:23", "jn.3.16", "1jhn 3 16", "jhn 3".
 *
 * Matching runs from strict to forgiving:
 *   1. exact alias / abbreviation / name      "ps", "rev", "1jn"
 *   2. prefix                                "luke", "songof"
 *   3. ordered subsequence                    "lk" -> "luke"
 *   4. small edit distance                    "jhn" -> "john"
 *
 * Ambiguous input is never guessed silently: `parse` reports confidence and the
 * competing books so the UI can offer a choice instead of picking for you.
 *
 * Works as a browser global (window.KBRef) and under Node for tests.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KBRef = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Lowercase and strip everything that is not a letter or digit. */
  function norm(value) {
    return String(value == null ? '' : value).toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  /** True when every character of `needle` appears in `hay`, in order. */
  function isSubsequence(needle, hay) {
    let i = 0;
    for (let j = 0; j < hay.length && i < needle.length; j++) {
      if (hay[j] === needle[i]) i++;
    }
    return i === needle.length;
  }

  /** Classic Levenshtein distance, two-row variant. */
  function editDistance(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let prev = new Array(b.length + 1);
    let curr = new Array(b.length + 1);
    for (let j = 0; j <= b.length; j++) prev[j] = j;
    for (let i = 1; i <= a.length; i++) {
      curr[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      }
      const swap = prev;
      prev = curr;
      curr = swap;
    }
    return prev[b.length];
  }

  /** Tolerance shrinks as the typed key gets shorter, so "j" stays rejected. */
  function maxEdits(len) {
    if (len <= 2) return 0;
    if (len <= 4) return 1;
    if (len <= 6) return 2;
    return 3;
  }

  /** Score one typed key against one candidate key. 0 means "no match". */
  function scorePair(query, key) {
    if (!query || !key) return 0;
    if (query === key) return 1000;
    if (key.startsWith(query)) return 700 + Math.round((60 * query.length) / key.length);
    if (query.startsWith(key)) return 680 + Math.round((60 * key.length) / query.length);
    if (isSubsequence(query, key)) return 400 + Math.round((40 * query.length) / key.length);
    const d = editDistance(query, key);
    return d <= maxEdits(query.length) ? 500 - d * 60 : 0;
  }

  /** Every key a book can be reached by. */
  function bookKeys(book) {
    const keys = new Set();
    const add = (v) => {
      const k = norm(v);
      if (k) keys.add(k);
    };
    add(book.name);
    add(book.abbr);
    (book.aliases || []).forEach(add);
    // "1 Samuel" should also answer to "samuel" and "sam"
    add(String(book.name).replace(/^[123]\s*/, ''));
    return Array.from(keys);
  }

  /** Precompute the lookup table once, after books.json loads. */
  function createIndex(books) {
    const list = Array.isArray(books) ? books : [];
    const entries = [];
    list.forEach((book, id) => {
      bookKeys(book).forEach((key) => entries.push({ id, name: book.name, key }));
    });
    return { books: list, entries };
  }

  /**
   * Reading popularity, most-read first. Ties in the matcher (a typo that is
   * equally close to two books, e.g. "jhn" -> "john" vs "jon") are broken
   * toward the book people actually open, the way BibleShow and YouVersion do,
   * instead of by canonical book order.
   */
  const FREQUENCY = [
    'Psalms', 'John', 'Genesis', 'Matthew', 'Romans', 'Isaiah', 'Acts', 'Luke',
    'Proverbs', 'Deuteronomy', 'Judges', '1 Corinthians', '2 Corinthians', 'James',
    '1 Peter', 'Hebrews', 'Philippians', 'Colossians', 'Galatians', 'Ephesians',
    '1 Thessalonians', '2 Thessalonians', '1 Timothy', '2 Timothy', 'Titus', 'Philemon',
    '1 John', '2 John', '3 John', 'Jude', 'Revelation', 'Exodus', 'Numbers', 'Joshua',
    'Ruth', '1 Samuel', '2 Samuel', '1 Kings', '2 Kings', '1 Chronicles', '2 Chronicles',
    'Ezra', 'Nehemiah', 'Esther', 'Job', 'Song of Solomon', 'Lamentations', 'Ezekiel',
    'Daniel', 'Hosea', 'Joel', 'Amos', 'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk',
    'Zephaniah', 'Haggai', 'Zechariah', 'Malachi', 'Mark', '2 Peter'
  ];
  const FREQ_RANK = new Map(FREQUENCY.map((name, i) => [name, i]));
  const UNRANKED = FREQUENCY.length;

  /** Rank every book against a typed key, best first. */
  function rankBooks(query, index) {
    const q = norm(query);
    if (!q || !index) return [];
    const best = new Map();
    for (let i = 0; i < index.entries.length; i++) {
      const e = index.entries[i];
      const s = scorePair(q, e.key);
      if (s > 0) {
        const prev = best.get(e.id);
        if (prev === undefined || s > prev) best.set(e.id, s);
      }
    }
    return Array.from(best, ([id, score]) => ({ id, score, name: index.books[id].name })).sort(
      (a, b) =>
        b.score - a.score ||
        (FREQ_RANK.get(a.name) ?? UNRANKED) - (FREQ_RANK.get(b.name) ?? UNRANKED) ||
        a.id - b.id
    );
  }
  /**
   * Split raw input into the book part and the trailing numbers.
   * Handles "luk 3 23", "luk3:23", "1 jhn 3 16", "1john 3 16", "jn 3:16-18".
   */
  function tokenize(raw) {
    const cleaned = String(raw == null ? '' : raw)
      .toLowerCase()
      .replace(/[‐-―−]/g, '-')
      .replace(/[.,:;\\/|]+/g, ' ')
      .replace(/[#*()\[\]"'`]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleaned) return null;

    const tokens = cleaned.split(' ').filter(Boolean);
    const book = [];
    const nums = [];

    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      const pure = /^\d+$/.test(t);
      // A lone leading digit followed by a word belongs to the book: "1 john"
      const ordinal =
        pure && !book.length && !nums.length && i + 1 < tokens.length && /[a-z]/.test(tokens[i + 1]);

      if (pure && !ordinal) {
        nums.push(+t);
        continue;
      }
      if (nums.length) {
        const rest = t.match(/\d+/g);
        if (rest) rest.forEach((d) => nums.push(+d));
        continue;
      }
      // One token can carry the ordinal, the name and the chapter glued
      // together: "luk3" -> Luke 3, "1john" -> 1 John, "1sam3" -> 1 Samuel 3.
      const parts = t.match(/^(\d*)([a-z]+)(\d*)$/);
      if (parts && (parts[1] || parts[3])) {
        book.push((parts[1] ? parts[1] + ' ' : '') + parts[2]);
        if (parts[3]) nums.push(+parts[3]);
        continue;
      }
      book.push(t);
    }
    return { book: book.join(' '), nums };
  }

  const CONFIDENT_MIN = 380; // below this the typed key is too weak to trust
  const CONFIDENT_GAP = 60; // and it must beat the runner-up by this much

  function finish(book, bookName, nums, confident, candidates) {
    const chapter = nums[0];
    const verse = nums.length > 1 ? nums[1] : 1;
    const verseEnd = nums.length > 2 ? nums[2] : verse;
    if (!(chapter > 0) || !(verse > 0) || verseEnd < verse) return null;
    const label =
      verseEnd !== verse ? `${bookName} ${chapter}:${verse}-${verseEnd}` : `${bookName} ${chapter}:${verse}`;
    return {
      ok: true,
      book,
      bookName,
      chapter,
      verse,
      verseEnd,
      confidence: confident,
      candidates,
      label
    };
  }

  /**
   * Parse a reference.
   *
   * @param {string} input                 e.g. "lk 3 23"
   * @param {object} options
   * @param {object} options.index         from createIndex(books)
   * @param {number} [options.contextBook] book id assumed for a bare "3:16"
   * @returns {object|null} { ok, book, bookName, chapter, verse, verseEnd,
   *                          confidence, candidates, label }
   */
  function parse(input, options) {
    const opts = options || {};
    const index = opts.index;
    if (!index || !index.books.length) return null;

    const parts = tokenize(input);
    if (!parts) return null;
    if (!parts.nums.length) return null; // a book on its own is not a reference

    // A bare "3:16" means chapter 3 verse 16 of whichever book is open.
    const bookKey = norm(parts.book);
    if (!bookKey) {
      const ctx = opts.contextBook;
      if (ctx === undefined || ctx === null || !index.books[ctx]) return null;
      return finish(ctx, index.books[ctx].name, parts.nums, true, []);
    }

    const ranked = rankBooks(bookKey, index);
    if (!ranked.length) return null;

    const top = ranked[0];
    const gap = ranked.length > 1 ? top.score - ranked[1].score : Infinity;
    const confident = top.score >= CONFIDENT_MIN && gap >= CONFIDENT_GAP;

    // Keep the plausible alternatives so the UI can ask instead of guessing.
    const candidates = ranked.slice(1, 6).map((r) => r.id);
    return finish(top.id, top.name, parts.nums, confident, confident ? [] : candidates);
  }

  /** Ranked suggestions for a live dropdown: the best match, then alternatives. */
  function suggest(input, options) {
    const opts = options || {};
    const limit = opts.limit || 6;
    const found = parse(input, opts);
    if (!found) return [];
    const out = [];
    if (found.confidence) {
      out.push({ label: found.label, book: found.book, chapter: found.chapter, verse: found.verse });
    }
    (found.candidates || []).forEach((id) => {
      const name = opts.index.books[id] ? opts.index.books[id].name : null;
      if (!name) return;
      out.push({
        label: `${name} ${found.chapter}:${found.verse}`,
        book: id,
        chapter: found.chapter,
        verse: found.verse
      });
    });
    return out.slice(0, limit);
  }

  /**
   * True when the text is reference-shaped and should open in the reader
   * instead of running a full-text search.
   */
  function looksLikeReference(input, options) {
    const opts = options || {};
    const parts = tokenize(input);
    if (!parts || !parts.nums.length) return false;
    if (!parts.book) return opts.contextBook !== undefined && opts.contextBook !== null;
    return rankBooks(parts.book, opts.index || { entries: [] }).length > 0;
  }

  return { createIndex, parse, suggest, looksLikeReference, norm, editDistance, isSubsequence, scorePair };
});
