#!/usr/bin/env node
'use strict';
/**
 * Account, session and sync tests. These handle real user data, so the checks
 * are about safety as much as function: passwords must never be stored or
 * echoed, sessions must not live in the database in plain form, and the server
 * must refuse to write state the client should not control.
 */
const assert = require('assert');
const fake = require('./helpers/fake-redis.js');

process.env.UPSTASH_REDIS_REST_URL = 'https://fake-redis.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token';

const accounts = require('../lib/accounts');
const accountApi = require('../api/account');
const syncApi = require('../api/sync');

const email = 'reader@example.com';
const password = 'FaithOverFear2026';

function mockRes() {
  return {
    statusCode: 0, headers: {}, body: '', ended: false,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    getHeader(k) { return this.headers[k.toLowerCase()]; },
    end(b) { this.body = b || ''; this.ended = true; },
    flushHeaders() {}
  };
}
const makeReq = (method, body, cookie) => ({
  method,
  headers: cookie ? { cookie } : {},
  query: {},
  body: body === undefined ? undefined : JSON.stringify(body),
  socket: { remoteAddress: '203.0.113.9' }
});
const parse = (res) => JSON.parse(res.body);
const allStored = () => JSON.stringify(Array.from(fake.store.values()));

(async () => {
  console.log('The service reports whether a database is configured');
  assert.strictEqual(accounts.configured, true, 'this suite runs against the fake store');
  console.log('  ok  configured = true when a database URL and token are present');

  console.log('\nPasswords are never stored or returned in plain form');
  const created = await accounts.createAccount(email, password, 'Reader');
  assert.ok(created.user, 'account should be created');
  assert.ok(!created.user.hash, 'the public user must not carry a password hash');
  assert.ok(!JSON.stringify(created.user).includes(password), 'plain password leaked in the response');
  assert.ok(!allStored().includes(password), 'plain password leaked into the database');
  assert.ok(/scrypt\$/.test(allStored()), 'the stored value should be a scrypt hash');
  console.log('  ok  database holds a scrypt hash, never the password');

  console.log('\nHashing is salted, so identical passwords differ');
  const h1 = accounts.hashPassword('SamePassword1');
  const h2 = accounts.hashPassword('SamePassword1');
  assert.notStrictEqual(h1, h2, 'two hashes of the same password must differ (random salt)');
  assert.ok(accounts.verifyPassword('SamePassword1', h1));
  assert.ok(accounts.verifyPassword('SamePassword1', h2));
  console.log('  ok  per-user random salt, and both still verify');

  console.log('\nWrong passwords and unknown emails are indistinguishable');
  assert.strictEqual(accounts.verifyPassword('wrong', h1), false);
  const bad = await accounts.authenticate(email, 'NotThePassword1');
  assert.ok(bad.error && !bad.user, 'a wrong password must not authenticate');
  const unknown = await accounts.authenticate('nobody@example.com', 'Whatever123');
  assert.strictEqual(unknown.error, bad.error, 'failures must not reveal which emails exist');
  console.log('  ok  identical error message, so emails cannot be enumerated');

  console.log('\nWeak passwords are refused up front');
  assert.ok(accounts.passwordProblem('short'));
  assert.ok(accounts.passwordProblem('alllowercaseletters'));
  assert.strictEqual(accounts.passwordProblem(password), null);
  const weak = await accounts.createAccount('weak@example.com', 'password', 'W');
  assert.ok(weak.error, 'a weak password must be rejected');
  console.log('  ok  minimum length and character mix enforced');

  console.log('\nDuplicate accounts are refused, regardless of case or spacing');
  const dupe = await accounts.createAccount(email, password, 'Someone Else');
  assert.ok(/already exists/i.test(dupe.error || ''), 'the same email must not register twice');
  const cased = await accounts.createAccount('  Reader@Example.COM ', password, 'Reader');
  assert.ok(/already exists/i.test(cased.error || ''), 'case must not create a second account');
  assert.strictEqual(accounts.normalizeEmail('  A@B.CO '), 'a@b.co');
  assert.strictEqual(accounts.normalizeEmail('not-an-email'), null);
  console.log('  ok  duplicates blocked and emails normalized');
  // __PART2__
  console.log('\nSessions are random, and only a hash of the token is stored');
  const token = await accounts.startSession(created.user.id);
  assert.ok(token && token.length >= 40, 'a session token should be long and random');
  const found = await accounts.userForToken(token);
  assert.ok(found && found.id === created.user.id, 'a valid token must resolve to the user');
  const sessionValues = Array.from(fake.store.entries())
    .filter(([k]) => k.startsWith('kb:sess:'))
    .map(([, v]) => v);
  assert.ok(sessionValues.length > 0, 'a session record should exist');
  assert.ok(sessionValues.every((v) => !v.includes(token)), 'the raw session token was stored');
  assert.ok(!allStored().includes(token), 'the raw session token appears anywhere in the store');
  console.log('  ok  database stores no usable session token');

  console.log('\nA forged token is refused, and sign-out revokes a real one');
  assert.strictEqual(await accounts.userForToken('made-up-token'), null);
  assert.strictEqual(await accounts.userForToken(''), null);
  assert.strictEqual(await accounts.userForToken(null), null);
  await accounts.endSession(token);
  assert.strictEqual(await accounts.userForToken(token), null, 'the token must stop working');
  console.log('  ok  forged tokens rejected, sign-out revokes the session');

  console.log('\nThe API hands out an httpOnly, Secure, SameSite cookie');
  let res = mockRes();
  await accountApi(makeReq('POST', { action: 'register', email: 'api@example.com', password, name: 'Api' }), res);
  assert.strictEqual(res.statusCode, 200, res.body);
  const cookie = res.getHeader('Set-Cookie');
  assert.ok(cookie, 'a session cookie must be set');
  assert.ok(/HttpOnly/i.test(cookie), 'cookie must be HttpOnly');
  assert.ok(/Secure/i.test(cookie), 'cookie must be Secure');
  assert.ok(/SameSite=Strict/i.test(cookie), 'cookie must be SameSite=Strict');
  console.log('  ok  HttpOnly + Secure + SameSite=Strict');

  console.log('\nThe API rejects bad input and bad credentials');
  for (const bad of [null, 'nope', { action: 'register', email: 'x@y.zz', password: 'short' }]) {
    const r = mockRes();
    await accountApi(makeReq('POST', bad), r);
    assert.strictEqual(r.statusCode, 400, `expected 400 for ${JSON.stringify(bad)}`);
  }
  const r401 = mockRes();
  await accountApi(makeReq('POST', { action: 'login', email: 'api@example.com', password: 'WrongPassword1' }), r401);
  assert.strictEqual(r401.statusCode, 401);
  console.log('  ok  400 for bad input, 401 for bad credentials');

  console.log('\nAuth is rate limited per address');
  let limited = false;
  for (let i = 0; i < 30; i++) {
    const r = mockRes();
    await accountApi(makeReq('POST', { action: 'login', email: 'api@example.com', password: 'WrongPassword1' }), r);
    if (r.statusCode === 429) { limited = true; break; }
  }
  assert.ok(limited, 'repeated login attempts should eventually be throttled');
  console.log('  ok  brute force is throttled with 429');
  console.log('\nSync requires a session');
  const noSession = mockRes();
  await syncApi(makeReq('GET'), noSession);
  assert.strictEqual(noSession.statusCode, 401, 'sync must not work without a session');
  const anonPush = mockRes();
  await syncApi(makeReq('POST', { data: { notes: { a: 1 } } }), anonPush);
  assert.strictEqual(anonPush.statusCode, 401, 'sync must not accept an anonymous push');
  console.log('  ok  401 without a valid session cookie');

  console.log('\nSync round-trips a real library');
  const authed = makeReq('GET', undefined, cookie);
  const library = {
    bookmarks: { 'John 3:16': { text: 'For God so loved the world', date: '2026-01-01' } },
    notes: { 'Psalms 23:1': { title: 'Shepherd', content: 'He leads', tags: ['hope'] } },
    collections: { c1: { id: 'c1', name: 'Gifts', refs: ['John 3:16'], created: '2026-01-02' } },
    readingDays: ['2026-01-01', '2026-01-02'],
    chaptersRead: ['42:3']
  };
  const push = mockRes();
  await syncApi({ ...makeReq('POST', { data: library }), headers: { cookie } }, push);
  assert.strictEqual(push.statusCode, 200, push.body);
  const pull = mockRes();
  await syncApi(authed, pull);
  assert.strictEqual(pull.statusCode, 200);
  const got = parse(pull).data;
  assert.ok(got, 'the library should come back');
  assert.deepStrictEqual(got.bookmarks, library.bookmarks);
  assert.deepStrictEqual(got.collections, library.collections, 'collections must survive a round trip');
  assert.deepStrictEqual(got.readingDays, library.readingDays);
  assert.deepStrictEqual(got.notes['Psalms 23:1'].tags, ['hope'], 'nested note fields must survive');
  console.log('  ok  pushed library reads back identically, including nested fields');

  console.log('\nThe server only stores whitelisted keys');
  const sneaky = {
    notes: { 'John 1:1': { title: 'In the beginning' } },
    account: { email: 'attacker@evil.test', signedIn: true },
    installed: true,
    notifSeen: ['read-today'],
    ministry: { church: 'Injected Church' }
  };
  const push2 = mockRes();
  await syncApi({ ...makeReq('POST', { data: sneaky }), headers: { cookie } }, push2);
  const back = mockRes();
  await syncApi(authed, back);
  const storedData = parse(back).data;
  assert.ok(storedData.notes, 'notes should be stored');
  ['account', 'installed', 'notifSeen', 'ministry'].forEach((k) => {
    assert.strictEqual(storedData[k], undefined, `${k} must not be writable from the client`);
  });
  console.log('  ok  account, installed, notifications and ministry are rejected on write');

  console.log('\nOversized payloads are refused');
  const huge = mockRes();
  await syncApi(
    { ...makeReq('POST', { data: { notes: { a: 'x'.repeat(3000000) } } }), headers: { cookie } },
    huge
  );
  assert.strictEqual(huge.statusCode, 400, 'a huge payload should be rejected');
  console.log('  ok  payloads over the limit are rejected');

  console.log('\nA database outage never fabricates a session');
  fake.fail(true);
  const down = mockRes();
  await accountApi(makeReq('GET'), down);
  assert.ok(!parse(down).user, 'an outage must never report a signed-in user');
  fake.fail(false);
  console.log('  ok  an outage degrades to signed-out, not to a fake session');

  console.log('\nAll account, session and sync tests passed.');
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
