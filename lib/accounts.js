'use strict';
/**
 * Cloud accounts and sync, backed by Vercel KV / Upstash Redis.
 *
 * Security notes, because this handles real user data:
 *  - Passwords are hashed with scrypt and a per-user random salt. The plain
 *    password is never stored, logged, or returned.
 *  - Sessions are 256-bit random tokens; only a SHA-256 hash of the token is
 *    stored, so a database leak does not hand over live sessions.
 *  - Comparison is timing-safe, and unknown emails still pay the hash cost so
 *    response time does not reveal which addresses are registered.
 *  - When no database is configured the module reports `configured: false` and
 *    the UI says so plainly rather than pretending to work.
 */
const crypto = require('crypto');

const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '';
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';
const configured = Boolean(url && token);

const SESSION_DAYS = 30;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const MAX_DATA_BYTES = 2_000_000;

const key = {
  user: (id) => `kb:user:${id}`,
  email: (email) => `kb:email:${email.toLowerCase()}`,
  session: (hash) => `kb:sess:${hash}`,
  data: (id) => `kb:data:${id}`
};

async function cmd(...args) {
  if (!configured) return null;
  const res = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(args)
  });
  if (!res.ok) return null;
  const data = await res.json();
  return Object.prototype.hasOwnProperty.call(data, 'result') ? data.result : null;
}

const get = (k) => cmd('GET', k);
const set = (k, v, ttl) => cmd('SET', k, v, 'EX', ttl);
const del = (k) => cmd('DEL', k);

async function readJSON(k) {
  const raw = await get(k);
  if (typeof raw !== 'string' || !raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/* ---------------------------- passwords ---------------------------- */

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, 64, SCRYPT_PARAMS);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  try {
    const [scheme, saltHex, hashHex] = String(stored).split('$');
    if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    const actual = crypto.scryptSync(String(password), salt, expected.length, SCRYPT_PARAMS);
    return crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

const sha256 = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');
const newSessionToken = () => crypto.randomBytes(32).toString('base64url');

/** Trim, lowercase and shape-check an email address. */
function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email)) return null;
  return email;
}

function passwordProblem(password) {
  const p = String(password || '');
  if (p.length < 10) return 'Use a password of at least 10 characters.';
  if (p.length > 200) return 'That password is too long.';
  if (!/[a-zA-Z]/.test(p) || !/[0-9\W]/.test(p)) return 'Mix letters with numbers or symbols.';
  return null;
}

const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, createdAt: u.createdAt });

/* ----------------------------- accounts ---------------------------- */

async function createAccount(email, password, name) {
  const mail = normalizeEmail(email);
  if (!mail) return { error: 'Enter a valid email address.' };
  const weak = passwordProblem(password);
  if (weak) return { error: weak };
  if (await get(key.email(mail))) return { error: 'An account with that email already exists.' };

  const id = crypto.randomUUID();
  const user = {
    id,
    email: mail,
    name: String(name || '').trim().slice(0, 60) || mail.split('@')[0],
    hash: hashPassword(password),
    createdAt: new Date().toISOString()
  };
  await set(key.user(id), JSON.stringify(user), 60 * 60 * 24 * 365);
  await set(key.email(mail), id, 60 * 60 * 24 * 365);
  return { user: publicUser(user) };
}

async function authenticate(email, password) {
  const mail = normalizeEmail(email);
  if (!mail) return { error: 'Enter a valid email address.' };
  const id = await get(key.email(mail));
  const user = id ? await readJSON(key.user(id)) : null;
  // Always pay the hashing cost, even for an unknown address.
  const ok = verifyPassword(password, user ? user.hash : 'scrypt$00$00');
  if (!user || !ok) return { error: 'Email or password is incorrect.' };
  return { user: publicUser(user) };
}

/* ----------------------------- sessions ---------------------------- */

async function startSession(userId) {
  const token = newSessionToken();
  await set(key.session(sha256(token)), JSON.stringify({ userId, at: Date.now() }), SESSION_DAYS * 86400);
  return token;
}

async function userForToken(token) {
  if (!token) return null;
  const session = await readJSON(key.session(sha256(token)));
  if (!session) return null;
  const user = await readJSON(key.user(session.userId));
  return user ? publicUser(user) : null;
}

async function endSession(token) {
  if (token) await del(key.session(sha256(token)));
}

/* ------------------------------- sync ------------------------------ */

// Only personal reading data travels. Device-local concerns such as the
// installed flag and dismissed notifications stay put.
const SYNCABLE = [
  'bookmarks', 'highlights', 'notes', 'prayers', 'planProgress', 'favorites',
  'readingDays', 'chaptersRead', 'devotionalDone', 'collections', 'history', 'profile'
];

function pickSyncable(state) {
  const out = {};
  SYNCABLE.forEach((k) => {
    if (state && state[k] !== undefined) out[k] = state[k];
  });
  return out;
}

async function saveData(userId, data) {
  if (!userId) return { error: 'Not signed in.' };
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { error: 'Invalid data.' };
  const payload = JSON.stringify(data);
  if (payload.length > MAX_DATA_BYTES) return { error: 'That is too much data to sync.' };
  const record = { data, updatedAt: new Date().toISOString() };
  await set(key.data(userId), JSON.stringify(record), 60 * 60 * 24 * 365);
  return { updatedAt: record.updatedAt };
}

async function loadData(userId) {
  if (!userId) return { error: 'Not signed in.' };
  const record = await readJSON(key.data(userId));
  if (!record) return { data: null, updatedAt: null };
  return { data: record.data, updatedAt: record.updatedAt };
}

module.exports = {
  configured,
  normalizeEmail,
  passwordProblem,
  hashPassword,
  verifyPassword,
  createAccount,
  authenticate,
  publicUser,
  startSession,
  userForToken,
  endSession,
  saveData,
  loadData,
  pickSyncable,
  SYNCABLE,
  SESSION_DAYS,
  MAX_DATA_BYTES
};
