'use strict';
/**
 * Stateless signed-cookie sessions.
 *
 * Vercel runs the app as short-lived serverless functions, so an in-memory
 * session store cannot work (every request may hit a different instance).
 * The session lives in an HttpOnly cookie signed with HMAC-SHA256 (SESSION_SECRET);
 * it holds only { role, uid, csrf, issued-at, expiry }. Nothing secret is stored in it.
 * The server re-checks the admin / student in the database on every protected request.
 */
const crypto = require('crypto');

const COOKIE = 'SDASH_SESS';

function createSessions({ secret, timeout, maxAge }) {
  const sign = (s) => crypto.createHmac('sha256', secret).update(s).digest('base64url');

  function encode(data) {
    const p = Buffer.from(JSON.stringify(data)).toString('base64url');
    return p + '.' + sign(p);
  }

  function decode(token, now = Date.now()) {
    if (typeof token !== 'string') return null;
    const i = token.indexOf('.');
    if (i < 1) return null;
    const p = token.slice(0, i);
    const given = Buffer.from(token.slice(i + 1));
    const expected = Buffer.from(sign(p));
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
    let d;
    try { d = JSON.parse(Buffer.from(p, 'base64url').toString('utf8')); } catch (e) { return null; }
    if (!d || typeof d !== 'object') return null;
    const sec = Math.floor(now / 1000);
    if (typeof d.e !== 'number' || d.e < sec) return null;                 // idle timeout
    if (typeof d.i !== 'number' || d.i + maxAge < sec) return null;        // absolute limit
    return d;
  }

  function parseCookies(header) {
    const out = {};
    if (!header) return out;
    for (const part of String(header).split(';')) {
      const k = part.indexOf('=');
      if (k < 1) continue;
      out[part.slice(0, k).trim()] = part.slice(k + 1).trim();
    }
    return out;
  }

  function cookieString(value, secure, maxAgeSec) {
    return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}` + (secure ? '; Secure' : '');
  }

  /** Express middleware: provides req.session, req.resetSession(), req.destroySession(). */
  function middleware(req, res, next) {
    const d = decode(parseCookies(req.headers.cookie)[COOKIE]);
    req.session = d ? { role: d.r || null, uid: d.u || null, csrf: d.c || null, iat: d.i } : {};
    let destroyed = false;

    req.resetSession = () => { req.session = { iat: Math.floor(Date.now() / 1000) }; destroyed = false; };
    req.destroySession = () => { req.session = {}; destroyed = true; };

    const origEnd = res.end;
    res.end = function patchedEnd(...args) {
      if (!res.headersSent) {
        const secure = !!req.secure;
        if (destroyed) {
          res.append('Set-Cookie', cookieString('', secure, 0));
        } else if (req.session && req.session.csrf) {
          const now = Math.floor(Date.now() / 1000);
          const s = req.session;
          const token = encode({ r: s.role || null, u: s.uid || null, c: s.csrf, i: s.iat || now, e: now + timeout });
          res.append('Set-Cookie', cookieString(token, secure, timeout)); // rolling idle timeout
        }
      }
      return origEnd.apply(this, args);
    };
    next();
  }

  return { encode, decode, parseCookies, middleware, COOKIE };
}

module.exports = { createSessions, COOKIE };
