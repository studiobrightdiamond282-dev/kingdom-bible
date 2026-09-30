'use strict';
// Netlify adapter for the account endpoint. Same handler shape as Vercel, with
// the query string Netlify supplies pre-parsed.
const vercel = require('../../api/account.js');

exports.handler = async (event, context) => {
  const headers = event.headers || {};
  const res = {
    statusCode: 200,
    headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    end(body) { this.body = body; }
  };
  const req = {
    method: event.httpMethod,
    headers,
    query: event.queryStringParameters || {},
    body: event.body,
    socket: {}
  };
  await vercel(req, res);
  return {
    statusCode: res.statusCode,
    headers: res.headers,
    body: res.body || ''
  };
};
