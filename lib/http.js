'use strict';

/** Security headers identical to the ones emitted by the local server.js. */
const CSP = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; worker-src 'self'; frame-ancestors 'self' *; base-uri 'self'; form-action 'self'";

function apply(res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', CSP);
}

function send(res, status, data) {
  res.statusCode = status;
  apply(res);
  res.end(JSON.stringify(data));
}

module.exports = { apply, send, CSP };
