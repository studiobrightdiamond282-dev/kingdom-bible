/**
 * KINGDOM BIBLE — sync merge.
 *
 * Pulling data down from an account must never cost the reader anything. The
 * rules, in priority order:
 *
 *  1. Anything already on this device is kept. Local wins every conflict.
 *  2. Reference maps (bookmarks, notes, highlights) merge key by key, so a
 *     verse saved on the phone and a note written on the laptop both survive.
 *  3. Day-stamp arrays (readingDays, chaptersRead) are unioned, so history is
 *     additive and never replayed twice.
 *  4. Nested objects gain only the fields they are missing.
 *
 * Only the whitelisted keys below are ever read from remote data, so a tampered
 * payload cannot set account, ministry or install state.
 *
 * Lives in its own module so it can be unit tested directly rather than being
 * scraped out of the app bundle.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KBSync = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Personal reading data that is safe to move between devices.
  const SYNCABLE = [
    'bookmarks', 'highlights', 'notes', 'prayers', 'planProgress', 'favorites',
    'readingDays', 'chaptersRead', 'devotionalDone', 'collections', 'history', 'profile'
  ];

  /** The subset of local state that should be sent to the cloud. */
  function pick(state) {
    const out = {};
    if (!state || typeof state !== 'object') return out;
    SYNCABLE.forEach((k) => {
      if (state[k] !== undefined) out[k] = state[k];
    });
    return out;
  }

  const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

  /** Union two arrays, preserving order and dropping duplicates. */
  function union(a, b) {
    return Array.from(new Set([...a, ...b]));
  }

  /**
   * Merge one record's fields. Missing fields are filled, lists are unioned
   * and nested records recurse. An existing local scalar always wins, because
   * inside a record (a note's content, a verse's text) the local copy is the
   * one the reader actually wrote.
   * @returns {boolean} whether anything changed
   */
  function mergeRecord(local, remote) {
    let changed = false;
    for (const key of Object.keys(remote)) {
      const r = remote[key];
      const l = local[key];
      if (l === undefined) {
        local[key] = r;
        changed = true;
        continue;
      }
      if (Array.isArray(l) && Array.isArray(r)) {
        const next = union(l, r);
        if (next.length !== l.length) {
          local[key] = next;
          changed = true;
        }
        continue;
      }
      if (isPlainObject(l) && isPlainObject(r)) {
        if (mergeRecord(l, r)) changed = true;
        continue;
      }
      // Otherwise the local value stands.
    }
    return changed;
  }

  /**
   * Merge `remote` into `state` in place.
   *
   * Top-level scalars (a chosen theme) take the cloud value, because settings
   * are meant to follow the account. Everything else keeps local data and only
   * gains what it is missing.
   *
   * @returns {number} how many top-level keys actually changed
   */
  function merge(state, remote) {
    if (!isPlainObject(state) || !isPlainObject(remote)) return 0;
    let changed = 0;
    for (const key of SYNCABLE) {
      if (!(key in remote)) continue;
      const r = remote[key];
      if (r === undefined || r === null) continue;
      if (!(key in state) || state[key] === undefined) {
        state[key] = r;
        changed++;
        continue;
      }
      const l = state[key];

      if (Array.isArray(r)) {
        if (!Array.isArray(l)) {
          state[key] = r;
          changed++;
          continue;
        }
        const next = union(l, r);
        if (next.length !== l.length) {
          state[key] = next;
          changed++;
        }
        continue;
      }

      if (isPlainObject(r)) {
        if (!isPlainObject(l)) {
          state[key] = r;
          changed++;
          continue;
        }
        if (mergeRecord(l, r)) changed++;
        continue;
      }

      if (l !== r) {
        state[key] = r;
        changed++;
      }
    }
    return changed;
  }

  return { SYNCABLE, pick, merge, mergeRecord, union };
});
