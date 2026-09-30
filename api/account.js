'use strict';
/**
 * Account endpoint: register, sign in, sign out, and "who am I".
 *
 * The session token is delivered in an httpOnly, SameSite=Strict cookie so
 * page scripts cannot read it, which also means it is not exposed to XSS.
 */
const { send } = require('../lib/http');
const accounts = require('../lib/accounts');

const COOKIE = 'kb_session';
const attempts = new Map(); // ip -> { count, resetAt }

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || 'local';
}

/** Simple per-IP throttle so password guessing is expensive. */
function allowAuth(req, res) {
  const ip = clientIp(req);
  const now = Date.now();
  const rec = attempts.get(ip) || { count: 0, resetAt: now + 15 * 60 * 1000 };
  if (now > rec.resetAt) {
    rec.count = 0;
    rec.resetAt = now + 15 * 60 * 1000;
  }
  rec.count++;
  attempts.set(ip, rec);
  if (rec.count > 20) {
    send(res, 429, { error: 'Too many attempts. Try again in a few minutes.' });
    return false;
  }
  return true;
}

function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  const found = header.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${name}=`));
  return found ? decodeURIComponent(found.slice(name.length + 1)) : null;
}

function setSessionCookie(res, token) {
  res.setHeader(
    'Set-Cookie',
    `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${accounts.SESSION_DAYS * 86400}`
  );
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`);
}

function readBody(req) {
  // A missing or unparseable body must never become null, or every
  // `body.action` lookup below would throw and return a 500.
  const raw = req.body;
  if (raw === null || raw === undefined) return {};
  if (typeof raw === 'object') return Array.isArray(raw) ? {} : raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw || '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

module.exports = async (req, res) => {
  const action = (req.query?.action || readBody(req).action || '').toString();
  const method = req.method || 'GET';

  if (method === 'GET') {
    if (!accounts.configured) {
      return send(res, 200, { configured: false, user: null });
    }
    const user = await accounts.userForToken(readCookie(req, COOKIE));
    return send(res, 200, { configured: true, user });
  }

  if (!accounts.configured) {
    return send(res, 503, {
      error: 'Cloud accounts are not connected on this deployment.',
      configured: false
    });
  }

  if (!allowAuth(req, res)) return;

  if (action === 'register') {
    const { email, password, name } = readBody(req);
    const result = await accounts.createAccount(email, password, name);
    if (result.error) return send(res, 400, { error: result.error });
    const token = await accounts.startSession(result.user.id);
    setSessionCookie(res, token);
    return send(res, 200, { user: result.user });
  }

  if (action === 'login') {
    const { email, password } = readBody(req);
    const result = await accounts.authenticate(email, password);
    if (result.error) return send(res, 401, { error: result.error });
    const token = await accounts.startSession(result.user.id);
    setSessionCookie(res, token);
    return send(res, 200, { user: result.user });
  }

  if (action === 'logout') {
    await accounts.endSession(readCookie(req, COOKIE));
    clearSessionCookie(res);
    return send(res, 200, { ok: true });
  }

  return send(res, 400, { error: 'Unknown action.' });
};
