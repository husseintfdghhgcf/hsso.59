'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createSessions } = require('../src/session');

const S = createSessions({ secret: 'unit-test-secret-1234567890', timeout: 60, maxAge: 3600 });
const now = Math.floor(Date.now() / 1000);

test('round trip', () => {
  const t = S.encode({ r: 'admin', u: 5, c: 'abc', i: now, e: now + 60 });
  const d = S.decode(t);
  assert.strictEqual(d.r, 'admin');
  assert.strictEqual(d.u, 5);
});

test('tampered payload is rejected', () => {
  const t = S.encode({ r: 'student', u: 1, c: 'abc', i: now, e: now + 60 });
  const [p, sig] = t.split('.');
  const evil = Buffer.from(JSON.stringify({ r: 'admin', u: 1, c: 'abc', i: now, e: now + 60 })).toString('base64url');
  assert.strictEqual(S.decode(evil + '.' + sig), null);
  assert.strictEqual(S.decode(p + '.' + sig.slice(0, -2) + 'xx'), null);
});

test('wrong secret is rejected', () => {
  const other = createSessions({ secret: 'another-secret-abcdefghij', timeout: 60, maxAge: 3600 });
  assert.strictEqual(S.decode(other.encode({ r: 'admin', u: 1, c: 'x', i: now, e: now + 60 })), null);
});

test('idle expiry and absolute expiry', () => {
  assert.strictEqual(S.decode(S.encode({ r: 'admin', u: 1, c: 'x', i: now, e: now - 1 })), null);
  assert.strictEqual(S.decode(S.encode({ r: 'admin', u: 1, c: 'x', i: now - 7200, e: now + 60 })), null);
});

test('garbage input', () => {
  for (const g of [undefined, null, '', 'abc', '.', 'a.b', 123]) assert.strictEqual(S.decode(g), null);
});

test('cookie parsing', () => {
  assert.deepStrictEqual(S.parseCookies('a=1; SDASH_SESS=xyz.sig; b=2'), { a: '1', SDASH_SESS: 'xyz.sig', b: '2' });
});

test('middleware sets and clears cookie', () => {
  const headers = [];
  const res = {
    headersSent: false,
    append: (k, v) => headers.push([k, v]),
    end() { this.headersSent = true; },
  };
  const req = { headers: {}, secure: true };
  S.middleware(req, res, () => {});
  req.session.csrf = 'tok'; req.session.role = 'admin'; req.session.uid = 3;
  res.end();
  assert.strictEqual(headers.length, 1);
  assert.match(headers[0][1], /^SDASH_SESS=.+; Path=\/; HttpOnly; SameSite=Lax; Max-Age=60; Secure$/);

  // next request carries the cookie -> session restored
  const token = headers[0][1].split(';')[0].split('=').slice(1).join('=');
  const req2 = { headers: { cookie: 'SDASH_SESS=' + token }, secure: false };
  const h2 = [];
  S.middleware(req2, { headersSent: false, append: (k, v) => h2.push(v), end() {} }, () => {});
  assert.strictEqual(req2.session.role, 'admin');
  assert.strictEqual(req2.session.uid, 3);

  // destroy -> expired cookie
  const h3 = [];
  const res3 = { headersSent: false, append: (k, v) => h3.push(v), end() { this.headersSent = true; } };
  const req3 = { headers: { cookie: 'SDASH_SESS=' + token }, secure: false };
  S.middleware(req3, res3, () => {});
  req3.destroySession();
  res3.end();
  assert.match(h3[0], /Max-Age=0/);
});
