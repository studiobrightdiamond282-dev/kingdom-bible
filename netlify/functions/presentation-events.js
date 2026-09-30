'use strict';

const store = require('../../lib/presentation-store');
const { apply } = require('../../lib/http');

// Netlify Functions cap execution at 10s on the Starter plan, so the stream
// deliberately stays inside that window and relies on EventSource reconnection.
const MAX_DURATION_MS = 8_000;
const POLL_MS = 1_000;

exports.handler = async (req, res) => {
  apply(res);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  let closed = false;
  const stop = setTimeout(() => {
    if (closed) return;
    closed = true;
    res.end();
  }, MAX_DURATION_MS);
  stop.unref?.();
  req.on?.('close', () => {
    closed = true;
    clearTimeout(stop);
  });

  let last = '';
  // First frame carries the current state so a new display is never blank.
  last = `data: ${JSON.stringify(await store.get())}\n\n`;
  res.write(last);

  const poller = setInterval(async () => {
    if (closed) return;
    try {
      const current = await store.get();
      if (current && current.ts) {
        const frame = `data: ${JSON.stringify(current)}\n\n`;
        if (frame !== last) {
          last = frame;
          res.write(frame);
        }
      }
    } catch {
      /* transient store error: keep the stream alive */
    }
  }, POLL_MS);
  poller.unref?.();
};
