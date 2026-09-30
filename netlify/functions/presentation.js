'use strict';

const { send } = require('../../lib/http');
const store = require('../../lib/presentation-store');

exports.handler = async (req, res) => {
  if (req.method === 'GET') return send(res, 200, await store.get());

  if (req.method === 'POST') {
    let payload;
    try {
      const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
      if (raw.length > 100000) return send(res, 413, { error: 'Payload too large' });
      payload = JSON.parse(raw || '{}');
    } catch {
      return send(res, 400, { error: 'Invalid JSON' });
    }

    const clean = await store.set(payload);
    if (!clean) return send(res, 400, { error: 'Invalid presentation payload' });
    return send(res, 200, { ok: true, updatedAt: clean.ts });
  }

  res.setHeader('Allow', 'GET, POST');
  return send(res, 405, { error: 'Method not allowed' });
};
