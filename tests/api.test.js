#!/usr/bin/env node
'use strict';
/**
 * Verifies the Vercel/Netlify serverless handlers behave like server.js does:
 * health output, presentation validation, GET/POST round-trip, and the
 * first-frame behaviour of the SSE stream.
 */
const assert = require('assert');
const path = require('path');

process.env.UPSTASH_REDIS_REST_URL = '';
process.env.UPSTASH_REDIS_REST_TOKEN = '';

const health = require('../api/health');
const presentation = require('../api/presentation');
const events = require('../api/presentation-events');
const netlifyPresentation = require('../netlify/functions/presentation');

function mockRes() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    ended: false,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    getHeader(k) { return this.headers[k.toLowerCase()]; },
    write(chunk) { this.body += chunk; return true; },
    end(chunk) { if (chunk) this.body += chunk; this.ended = true; },
    flushHeaders() { this.flushed = true; }
  };
}

(async () => {
  // health
  let res = mockRes();
  health({ method: 'GET' }, res);
  const healthBody = JSON.parse(res.body);
  assert.equal(res.statusCode, 200);
  assert.equal(healthBody.status, 'healthy');
  assert.equal(healthBody.version, '1.0.0');
  assert.ok(res.headers['content-security-policy'], 'CSP header must be present');
  console.log('✓ health endpoint returns operational status with security headers');

  // presentation GET before any write
  res = mockRes();
  await presentation({ method: 'GET' }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['cache-control'], undefined);
  console.log('✓ presentation GET returns a payload');

  // POST with a valid payload
  res = mockRes();
  await presentation(
    { method: 'POST', body: { text: 'For God so loved the world', ref: 'John 3:16', translation: 'kjv', theme: 'royal', church: 'Test Church' } },
    res
  );
  assert.equal(res.statusCode, 200);
  const written = JSON.parse(res.body);
  assert.equal(written.ok, true);
  assert.ok(written.updatedAt > 0, 'updatedAt must be a timestamp');
  console.log('✓ presentation POST accepts and normalizes a valid payload');

  // the stored value is readable back
  res = mockRes();
  await presentation({ method: 'GET' }, res);
  const current = JSON.parse(res.body);
  assert.equal(current.text, 'For God so loved the world');
  assert.equal(current.ref, 'John 3:16');
  assert.equal(current.theme, 'royal');
  assert.equal(current.church, 'Test Church');
  console.log('✓ presentation GET returns exactly what was POSTed');

  // unknown theme falls back to royal, text is length-bounded
  res = mockRes();
  await presentation({ method: 'POST', body: { text: 'x'.repeat(5000), theme: 'neon' } }, res);
  assert.equal(res.statusCode, 200);
  res = mockRes();
  await presentation({ method: 'GET' }, res);
  const bounded = JSON.parse(res.body);
  assert.equal(bounded.text.length, 3000, 'text must be truncated to 3000 chars');
  assert.equal(bounded.theme, 'royal', 'invalid theme must fall back to royal');
  console.log('✓ untrusted payloads are bounded and sanitized');

  // An empty body is parsed as {} and accepted, matching server.js: its body()
  // helper does JSON.parse(s || '{}') and safePresentation({}) returns a valid
  // (all-empty) payload. Arrays are rejected, which is stricter than the
  // original, since typeof [] === 'object' would otherwise slip through.
  res = mockRes();
  await presentation({ method: 'POST', body: null }, res);
  assert.equal(res.statusCode, 200, 'empty body must stay compatible with server.js');

  // non-object JSON and unparseable text are rejected
  for (const bad of ['not json', 42, true, []]) {
    res = mockRes();
    await presentation({ method: 'POST', body: bad }, res);
    assert.equal(res.statusCode, 400, `expected 400 for ${JSON.stringify(bad)}`);
  }
  console.log('✓ malformed payloads return 400');

  // oversized payload
  res = mockRes();
  await presentation({ method: 'POST', body: JSON.stringify({ text: 'y'.repeat(200000) }) }, res);
  assert.equal(res.statusCode, 413);
  console.log('✓ oversized payloads return 413');

  // unsupported method
  res = mockRes();
  await presentation({ method: 'DELETE' }, res);
  assert.equal(res.statusCode, 405);
  console.log('✓ unsupported methods return 405');

  // netlify adapter shares the same logic (re-post first, since the malformed
  // and empty-body cases above intentionally changed the stored payload)
  res = mockRes();
  await netlifyPresentation.handler(
    { method: 'POST', body: { text: 'netlify adapter', ref: 'Psalm 23:1', theme: 'dark' } },
    res
  );
  assert.equal(res.statusCode, 200);
  res = mockRes();
  await netlifyPresentation.handler({ method: 'GET' }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).text, 'netlify adapter');
  assert.equal(JSON.parse(res.body).theme, 'dark');
  console.log('✓ netlify presentation adapter behaves identically');

  // SSE sends the current state as its first frame
  res = mockRes();
  await presentation({ method: 'POST', body: { text: 'streamed verse', ref: 'John 1:1', theme: 'light' } }, res);
  assert.equal(res.statusCode, 200);
  res = mockRes();
  const done = events({ method: 'GET', on: () => {} }, res);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(res.headers['content-type'], 'text/event-stream; charset=utf-8');
  assert.equal(res.headers['cache-control'], 'no-cache, no-transform');
  assert.ok(res.body.startsWith('data: '), 'stream must open with a data frame');
  const first = JSON.parse(res.body.split('\n')[0].slice(6));
  assert.equal(first.text, 'streamed verse', 'first SSE frame must carry current state');
  assert.equal(first.ref, 'John 1:1');
  res.end();
  await done;
  console.log('✓ SSE stream opens with the current presentation state');

  console.log('\nAll serverless API tests passed.');
})().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
