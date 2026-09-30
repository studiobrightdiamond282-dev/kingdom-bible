'use strict';

const store = require('../lib/presentation-store');
const { apply } = require('../lib/http');

// Vercel terminates a function once its duration budget is spent. We stay well
// under it and let the browser's EventSource reconnect, which is a no-op when
// nothing changed because the first frame always carries the current state.
const MAX_DURATION_MS = 45_000;
const POLL_MS = 2_000;
const HEARTBEAT_MS = 15_000;

module.exports = async (req, res) => {
  apply(res);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  let closed = false;
  const finish = () => {
    if (closed) return;
    closed = true;
    clearInterval(poller);
    clearInterval(heartbeat);
    res.end();
  };
  req.on('close', finish);

  let last = '';
  const push = (payload) => {
    if (closed) return;
    const frame = `data: ${JSON.stringify(payload)}\n\n`;
    last = frame;
    res.write(frame);
  };

  // Immediate first frame so a freshly opened audience display is never blank.
  push(await store.get());

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

  // Comment frames keep intermediaries from closing an idle stream.
  const heartbeat = setInterval(() => {
    if (!closed) res.write(': keep-alive\n\n');
  }, HEARTBEAT_MS);

  const budget = setTimeout(finish, MAX_DURATION_MS);
  budget.unref?.();
};
