'use strict';
const bcrypt = require('bcryptjs');
const { query } = require('./db');
const config = require('./config');
const { cleanText, newCsrf, safeEqual } = require('./helpers');
const { studentProfile } = require('./repository');

// Used so that unknown usernames cost the same time as wrong passwords.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);
const clientIp = (req) => String(req.ip || '0.0.0.0').slice(0, 45);

/* ---------- login logging & brute-force throttling ---------- */

async function logLogin(req, role, userId, username, success) {
  try {
    await query(
      'INSERT INTO login_logs (role, user_id, username, ip_address, user_agent, success) VALUES ($1, $2, $3, $4, $5, $6)',
      [role, userId, [...String(username)].slice(0, 120).join(''), clientIp(req), String(req.get('user-agent') || '').slice(0, 255), !!success]
    );
    if (success) { // housekeeping: keep 90 days of history
      await query("DELETE FROM login_logs WHERE created_at < now() - interval '90 days'");
    }
  } catch (e) {
    console.error('login log failed:', e.message);
  }
}

async function loginIsBlocked(req, role) {
  const rows = await query(
    `SELECT COUNT(*) AS c FROM login_logs
     WHERE role = $1 AND ip_address = $2 AND success = FALSE
       AND created_at > now() - make_interval(mins => $3::int)`,
    [role, clientIp(req), config.lockoutMinutes]
  );
  return Number(rows[0].c) >= config.maxFailedLogins;
}

/* ---------- session helpers (signed cookie, see session.js) ---------- */

function sessionBegin(req, role, userId) {
  req.resetSession();            // brand-new session = fixation protection
  req.session.role = role;
  req.session.uid = userId;
  req.session.csrf = newCsrf();
}

function ensureCsrf(req) {
  if (!req.session.csrf) {
    req.session.csrf = newCsrf();
    req.session.iat = req.session.iat || Math.floor(Date.now() / 1000);
  }
  return req.session.csrf;
}

/* ---------- login attempts ---------- */

const BLOCKED_MSG = 'تم تجاوز عدد محاولات الدخول المسموحة. حاول مرة أخرى بعد قليل.';

async function attemptAdminLogin(req, usernameRaw, password) {
  const username = String(usernameRaw || '').trim();
  if (await loginIsBlocked(req, 'admin')) return { ok: false, status: 429, message: BLOCKED_MSG };

  const rows = await query('SELECT id, username, password_hash FROM admins WHERE username = $1 LIMIT 1', [username]);
  const row = rows[0];
  const match = await bcrypt.compare(password, row ? row.password_hash : DUMMY_HASH);

  if (!row || !match) {
    await logLogin(req, 'admin', row ? row.id : null, username, false);
    return { ok: false, status: 401, message: 'اسم المستخدم أو كلمة المرور غير صحيحة.' };
  }
  await query('UPDATE admins SET last_login_at = now() WHERE id = $1', [row.id]);
  await logLogin(req, 'admin', row.id, username, true);
  sessionBegin(req, 'admin', row.id);
  return { ok: true };
}

async function attemptStudentLogin(req, nameRaw, password) {
  let name;
  try { name = cleanText(nameRaw); } catch (e) { name = ''; }
  if (await loginIsBlocked(req, 'student')) return { ok: false, status: 429, message: BLOCKED_MSG };

  const rows = await query('SELECT id, name, password_hash FROM students WHERE lower(name) = lower($1) LIMIT 1', [name]);
  const row = rows[0];
  const match = await bcrypt.compare(password, row ? row.password_hash : DUMMY_HASH);

  if (!row || !match) {
    await logLogin(req, 'student', row ? row.id : null, name, false);
    return { ok: false, status: 401, message: 'الاسم أو كلمة المرور غير صحيحة.' };
  }
  await logLogin(req, 'student', row.id, name, true);
  sessionBegin(req, 'student', row.id);
  return { ok: true };
}

/* ---------- middleware ---------- */

const SESSION_ENDED = { ok: false, message: 'انتهت الجلسة، يرجى تسجيل الدخول.' };

/** Admin API guard: signed session + role, re-checked against the database. */
async function apiRequireAdmin(req, res, next) {
  try {
    const s = req.session;
    if (!s || !s.role || !s.uid) return res.status(401).json(SESSION_ENDED);
    if (s.role !== 'admin') return res.status(403).json({ ok: false, message: 'غير مصرح لك بتنفيذ هذه العملية.' });
    const rows = await query('SELECT id FROM admins WHERE id = $1 LIMIT 1', [s.uid]);
    if (rows.length === 0) return res.status(401).json(SESSION_ENDED);
    next();
  } catch (e) { next(e); }
}

/** Student API guard. The student id ALWAYS comes from the signed session, never from the request. */
async function apiRequireStudent(req, res, next) {
  try {
    const s = req.session;
    if (!s || s.role !== 'student' || !s.uid) return res.status(401).json(SESSION_ENDED);
    const profile = await studentProfile(s.uid);
    if (!profile) {
      req.destroySession();
      return res.status(401).json(SESSION_ENDED);
    }
    req.profile = profile;
    next();
  } catch (e) { next(e); }
}

/** CSRF check for every state-changing request (X-CSRF-Token header). */
function csrfProtect(req, res, next) {
  if (!req.session || !req.session.csrf || !safeEqual(req.session.csrf, req.get('x-csrf-token'))) {
    return res.status(403).json({ ok: false, message: 'رمز الحماية غير صالح، أعد تحميل الصفحة.' });
  }
  next();
}

/** HTML page guard (dashboards are served only to the right role). */
function pageRequireRole(role, loginPath) {
  return (req, res, next) => {
    if (req.session && req.session.role === role && req.session.uid) return next();
    res.redirect(loginPath);
  };
}

module.exports = {
  attemptAdminLogin, attemptStudentLogin, apiRequireAdmin, apiRequireStudent,
  csrfProtect, pageRequireRole, ensureCsrf,
};
