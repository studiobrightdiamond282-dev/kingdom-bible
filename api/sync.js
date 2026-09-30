'use strict';
/**
 * Sync endpoint: push or pull the reader's personal data.
 * Requires a valid session cookie; never trust a user id from the client.
 */
const { send } = require('../lib/http');
const accounts = require('../lib/accounts');

const COOKIE = 'kb_session';

function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  const found = header.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${name}=`));
  return found ? decodeURIComponent(found.slice(name.length + 1)) : null;
}

function readBody(req) {
  // A missing or unparseable body must never become null.
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
  if (!accounts.configured) {
    return send(res, 503, { error: 'Sync is not connected on this deployment.', configured: false });
  }

  const user = await accounts.userForToken(readCookie(req, COOKIE));
  if (!user) return send(res, 401, { error: 'Sign in to sync.' });

  const method = req.method || 'GET';

  if (method === 'GET') {
    const { data, updatedAt } = await accounts.loadData(user.id);
    return send(res, 200, { data, updatedAt });
  }

  if (method === 'POST') {
    const body = readBody(req);
    const incoming = body.data && typeof body.data === 'object' ? body.data : null;
    if (!incoming) return send(res, 400, { error: 'Nothing to sync.' });

    // Strip anything the client should not be able to write.
    const clean = accounts.pickSyncable(incoming);
    const result = await accounts.saveData(user.id, clean);
    if (result.error) return send(res, 400, { error: result.error });
    return send(res, 200, { ok: true, updatedAt: result.updatedAt, keys: Object.keys(clean).length });
  }

  return send(res, 405, { error: 'Method not allowed' });
};
