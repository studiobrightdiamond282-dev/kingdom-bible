'use strict';
// Netlify adapter for the sync endpoint.
const vercel = require('../../api/sync.js');

exports.handler = async (event) => {
  const res = {
    statusCode: 200,
    headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    end(body) { this.body = body; }
  };
  const req = {
    method: event.httpMethod,
    headers: event.headers || {},
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
