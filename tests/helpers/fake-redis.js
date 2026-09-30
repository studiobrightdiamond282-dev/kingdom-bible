'use strict';
/**
 * Stands in for Upstash/Vercel KV so the real account and sync logic can be
 * exercised end to end without provisioning a database. The Redis command
 * surface used here is only GET / SET / DEL.
 */
const crypto = require('crypto');
const store = new Map();
const expires = new Map();
let failed = false;

function live(key) {
  const at = expires.get(key);
  if (at && at < Date.now()) {
    store.delete(key);
    expires.delete(key);
    return false;
  }
  return true;
}

// Only the token is stored, so a test can assert that the raw cookie value is
// never written to the database.
const written = new Set();

global.fetch = async (url, init) => {
  if (failed) return { ok: false, status: 500, json: async () => ({}) };
  const args = JSON.parse(init.body);
  const [cmd, key, value, , ttl] = args;
  const json = (result) => ({ ok: true, status: 200, json: async () => ({ result }) });

  if (cmd === 'GET') {
    if (!live(key)) return json(null);
    return json(store.has(key) ? store.get(key) : null);
  }
  if (cmd === 'SET') {
    store.set(key, String(value));
    expires.set(key, Date.now() + Number(ttl || 0) * 1000);
    written.add(String(value));
    return json('OK');
  }
  if (cmd === 'DEL') {
    store.delete(key);
    expires.delete(key);
    return json(1);
  }
  return json(null);
};

module.exports = {
  store,
  written,
  fail: (on) => { failed = on; },
  reset: () => { store.clear(); expires.clear(); written.clear(); failed = false; },
  randomHex: (n) => crypto.randomBytes(n).toString('hex')
};
