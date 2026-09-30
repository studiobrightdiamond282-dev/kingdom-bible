'use strict';

/**
 * Shared state for the Ministry Mode presentation broadcast.
 *
 * Vercel serverless functions are stateless, so the current payload is kept in
 * process memory (fast path, correct whenever invocations land on the same warm
 * instance) and mirrored to Upstash Redis when UPSTASH_REDIS_REST_URL and
 * UPSTASH_REDIS_REST_TOKEN are configured, which makes it correct across every
 * instance and region.
 *
 * With no Redis configured the app is still fully usable: public/app.js applies
 * updates through localStorage, the `storage` event, and BroadcastChannel, so
 * presenter + audience windows on the same device stay in sync regardless.
 */

const KEY = 'kingdom:presentation';
const MAX_TEXT = 3000;
const MAX_SHORT = 150;
const THEMES = ['royal', 'dark', 'light', 'transparent'];

let memory = {};

const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '';
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';

const hasRedis = Boolean(redisUrl && redisToken);

/** Run one Redis command through the Upstash REST API. Returns null when unavailable. */
async function redis(command) {
  if (!hasRedis) return null;
  try {
    const res = await fetch(redisUrl, {
      method: 'POST',
      headers: { authorization: `Bearer ${redisToken}`, 'content-type': 'application/json' },
      body: JSON.stringify(command)
    });
    if (!res.ok) return null;
    const data = await res.json();
    return Object.prototype.hasOwnProperty.call(data, 'result') ? data.result : null;
  } catch {
    return null;
  }
}

/** Validate and bound an untrusted presentation payload, mirroring server.js. */
function sanitize(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const str = (key, max) => (typeof input[key] === 'string' ? input[key].slice(0, max) : '');
  return {
    text: str('text', MAX_TEXT),
    ref: str('ref', MAX_SHORT),
    translation: str('translation', MAX_SHORT),
    theme: THEMES.includes(input.theme) ? input.theme : 'royal',
    church: str('church', MAX_SHORT),
    blank: Boolean(input.blank),
    ts: Date.now()
  };
}

/** Read the current presentation payload. */
async function get() {
  const raw = await redis(['GET', KEY]);
  if (typeof raw === 'string' && raw) {
    try {
      memory = JSON.parse(raw);
    } catch {
      /* keep last good in-memory copy */
    }
  }
  return memory;
}

/** Replace the current presentation payload after validation. */
async function set(input) {
  const clean = sanitize(input);
  if (!clean) return null;
  memory = clean;
  // The payload is display text, never rendered as HTML, but escape quotes so the
  // value stays a valid, unambiguous Redis string regardless of the client.
  await redis(['SET', KEY, JSON.stringify(clean), 'EX', '86400']);
  return clean;
}

module.exports = { get, set, sanitize, hasRedis };
