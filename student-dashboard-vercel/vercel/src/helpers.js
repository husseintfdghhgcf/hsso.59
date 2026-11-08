'use strict';
const crypto = require('crypto');

/** Business / validation error whose message is safe to show to the user. */
class AppException extends Error {
  constructor(message, status = 422) {
    super(message);
    this.status = status;
  }
}

/** Number of characters (not bytes). */
function strChars(s) {
  return [...String(s)].length;
}

/** Trim + collapse whitespace; rejects control characters. */
function cleanText(value) {
  if (value !== null && value !== undefined && typeof value === 'object') {
    throw new AppException('قيمة غير صالحة.');
  }
  const s = String(value ?? '').trim();
  if (s === '') return '';
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(s)) {
    throw new AppException('يحتوي النص على رموز غير مسموحة.');
  }
  return s.replace(/\s+/gu, ' ');
}

/** Single source of truth for allowed avatars. */
const AVATARS = [
  '\u{1F468}\u200D\u{1F393}', // 👨‍🎓
  '\u{1F469}\u200D\u{1F393}', // 👩‍🎓
  '\u{1F468}\u200D\u{1F4BB}', // 👨‍💻
  '\u{1F469}\u200D\u{1F52C}', // 👩‍🔬
  '\u{1F466}',                // 👦
  '\u{1F467}',                // 👧
  '\u{1F9D1}\u200D\u{1F3EB}', // 🧑‍🏫
  '\u{1F680}',                // 🚀
  '\u2B50',                   // ⭐
  '\u{1F3C6}',                // 🏆
];

/** Strict integer parsing (accepts 12 or "12", rejects "12abc", 1.5, null, ""). */
function toInt(v, min = -Infinity, max = Infinity) {
  let n;
  if (typeof v === 'number') n = v;
  else if (typeof v === 'string' && /^-?\d+$/.test(v.trim())) n = parseInt(v.trim(), 10);
  else return null;
  if (!Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

function newCsrf() {
  return crypto.randomBytes(32).toString('hex');
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const A = Buffer.from(a);
  const B = Buffer.from(b);
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}

module.exports = { AppException, strChars, cleanText, AVATARS, toInt, newCsrf, safeEqual };
