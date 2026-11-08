'use strict';
/**
 * End-to-end test against a running instance (local or Vercel).
 *
 *   BASE_URL=http://localhost:3000 ADMIN_USER=admin ADMIN_PASS='...' npm run smoke
 *   BASE_URL=https://your-app.vercel.app ADMIN_USER=admin ADMIN_PASS='...' npm run smoke
 *
 * Optional: SAMPLE_STUDENT / SAMPLE_PASS (defaults to the seeded student).
 * It creates its own test group/student (names start with "TEST-") and deletes them at the end.
 */
require('dotenv').config();
const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASS = process.env.ADMIN_PASS;
const SAMPLE_STUDENT = process.env.SAMPLE_STUDENT || 'عمر خالد العتيبي';
const SAMPLE_PASS = process.env.SAMPLE_PASS || 'Student@2026';

if (!ADMIN_USER || !ADMIN_PASS) {
  console.error('Set ADMIN_USER and ADMIN_PASS (and optionally BASE_URL).');
  process.exit(1);
}

let passed = 0, failed = 0;
function check(name, cond, extra) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
}

class Client {
  constructor() { this.cookies = {}; this.csrf = ''; }
  async req(method, path, body, opts = {}) {
    const headers = { Accept: 'application/json' };
    const cookie = Object.entries(this.cookies).map(([k, v]) => k + '=' + v).join('; ');
    if (cookie) headers.Cookie = cookie;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (method !== 'GET' && this.csrf && !opts.noCsrf) headers['X-CSRF-Token'] = this.csrf;
    const res = await fetch(BASE + path, {
      method, headers, redirect: 'manual', body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    for (const c of (res.headers.getSetCookie ? res.headers.getSetCookie() : [])) {
      const [kv] = c.split(';');
      const i = kv.indexOf('=');
      const k = kv.slice(0, i), v = kv.slice(i + 1);
      if (/Max-Age=0/i.test(c) || v === '') delete this.cookies[k]; else this.cookies[k] = v;
    }
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) { /* html */ }
    return { status: res.status, json: json || {}, text, headers: res.headers };
  }
  async session() { const r = await this.req('GET', '/api/session'); this.csrf = r.json.csrf; return r.json; }
}

(async () => {
  const stamp = Date.now().toString().slice(-6);
  const GROUP = 'TEST-مجموعة-' + stamp;
  const NAME = 'TEST طالب اختبار ' + stamp;
  const NAME2 = 'TEST طالب معدل ' + stamp;

  console.log('Target: ' + BASE + '\n');

  console.log('Pages');
  const anon = new Client();
  for (const p of ['/', '/admin/login.html', '/student/login.html', '/assets/css/style.css', '/assets/js/admin.js']) {
    const r = await anon.req('GET', p);
    check('GET ' + p + ' -> 200', r.status === 200, r.status);
  }
  for (const p of ['/admin/', '/student/']) {
    const r = await anon.req('GET', p);
    check('GET ' + p + ' without login redirects to login', r.status === 302 && /login\.html/.test(r.headers.get('location') || ''), r.status);
  }
  const noAuth = await anon.req('GET', '/api/admin');
  check('GET /api/admin without login -> 401', noAuth.status === 401, noAuth.status);

  console.log('\nAdmin login');
  const admin = new Client();
  const s0 = await admin.session();
  check('/api/session returns csrf and role=null', !!s0.csrf && s0.role === null);
  const noCsrf = await admin.req('POST', '/api/admin/login', { username: ADMIN_USER, password: ADMIN_PASS }, { noCsrf: true });
  check('login without CSRF header -> 403', noCsrf.status === 403, noCsrf.status);
  const bad = await admin.req('POST', '/api/admin/login', { username: ADMIN_USER, password: 'definitely-wrong-' + stamp });
  check('wrong password -> 401', bad.status === 401, bad.status);
  const good = await admin.req('POST', '/api/admin/login', { username: ADMIN_USER, password: ADMIN_PASS });
  check('correct password -> 200', good.status === 200 && good.json.ok, good.status + ' ' + (good.json.message || ''));
  if (!good.json.ok) { console.log('\nCannot continue without admin login.'); process.exit(1); }
  await admin.session();
  const page = await admin.req('GET', '/admin/');
  check('/admin/ after login -> 200 HTML', page.status === 200 && /<html/i.test(page.text), page.status);
  const st = await admin.req('GET', '/api/admin?sort=scoreDesc');
  check('GET /api/admin returns state', st.status === 200 && Array.isArray(st.json.state && st.json.state.students));

  console.log('\nGroups: add / duplicate / delete');
  const gAdd = await admin.req('POST', '/api/admin', { action: 'group_add', name: GROUP });
  check('add group', gAdd.status === 200 && gAdd.json.ok, gAdd.json.message);
  const gDup = await admin.req('POST', '/api/admin', { action: 'group_add', name: GROUP });
  check('duplicate group rejected (422)', gDup.status === 422, gDup.status);
  const group = ((gAdd.json.state || {}).groups || []).find((g) => g.name === GROUP);
  check('new group appears in state', !!group);
  if (!group) process.exit(1);

  console.log('\nStudents: add');
  const bigScore = await admin.req('POST', '/api/admin', { action: 'student_save', name: NAME, password: 'Pass1234', group_id: group.id, score: 101 });
  check('score 101 rejected (422)', bigScore.status === 422, bigScore.status);
  const noPass = await admin.req('POST', '/api/admin', { action: 'student_save', name: NAME, group_id: group.id, score: 50 });
  check('missing password rejected (422)', noPass.status === 422, noPass.status);
  const add = await admin.req('POST', '/api/admin', { action: 'student_save', name: NAME, password: 'Pass1234', group_id: group.id, score: 70, avatar: '🚀' });
  check('add student', add.status === 200 && add.json.ok, add.json.message);
  const dupName = await admin.req('POST', '/api/admin', { action: 'student_save', name: NAME, password: 'Pass1234', group_id: group.id, score: 60 });
  check('duplicate student name rejected (422)', dupName.status === 422, dupName.status);
  const me = ((add.json.state || {}).students || []).find((s) => s.name === NAME);
  check('new student has code STD-xxx, rank and avatar', !!me && /^STD-\d+$/.test(me.code) && me.rank >= 1 && me.avatar === '🚀', JSON.stringify(me));
  if (!me) process.exit(1);

  console.log('\nScores: quick adjust');
  let r = await admin.req('POST', '/api/admin', { action: 'score_adjust', id: me.id, delta: 5 });
  check('+5 -> 75', r.json.ok && r.json.state.students.find((s) => s.id === me.id).score === 75, r.json.message);
  r = await admin.req('POST', '/api/admin', { action: 'score_adjust', id: me.id, delta: 100 });
  check('clamped at 100', r.json.ok && r.json.state.students.find((s) => s.id === me.id).score === 100);
  r = await admin.req('POST', '/api/admin', { action: 'score_adjust', id: me.id, delta: -100 });
  check('clamped at 0', r.json.ok && r.json.state.students.find((s) => s.id === me.id).score === 0);
  r = await admin.req('POST', '/api/admin', { action: 'score_adjust', id: me.id, delta: 'abc' });
  check('invalid delta rejected (422)', r.status === 422, r.status);

  console.log('\nStudents: edit / search / filter');
  const edit = await admin.req('POST', '/api/admin', { action: 'student_save', id: me.id, name: NAME2, group_id: group.id, score: 88, avatar: '🏆' });
  check('edit student (no new password)', edit.status === 200 && edit.json.ok, edit.json.message);
  const edited = (edit.json.state.students || []).find((s) => s.id === me.id);
  check('edited values saved', !!edited && edited.name === NAME2 && edited.score === 88 && edited.avatar === '🏆');
  const q = await admin.req('GET', '/api/admin?q=' + encodeURIComponent('TEST طالب معدل ' + stamp));
  check('search by name', q.json.state.students.length === 1 && q.json.state.students[0].id === me.id);
  const q2 = await admin.req('GET', '/api/admin?q=' + encodeURIComponent(me.code));
  check('search by STD code', q2.json.state.students.some((s) => s.id === me.id));
  const q3 = await admin.req('GET', '/api/admin?q=' + encodeURIComponent('%'));
  check('LIKE wildcard "%" is escaped (no match-all)', q3.status === 200 && q3.json.state.students.length === 0);
  const f = await admin.req('GET', '/api/admin?group=' + group.id);
  check('filter by group', f.json.state.students.length === 1);

  console.log('\nGroup protection');
  const gDelBlocked = await admin.req('POST', '/api/admin', { action: 'group_delete', id: group.id });
  check('delete group with students blocked (422)', gDelBlocked.status === 422, gDelBlocked.status);

  console.log('\nStudent portal');
  const stu = new Client();
  await stu.session();
  const sBad = await stu.req('POST', '/api/student/login', { student_name: NAME2, password: 'wrong-pass' });
  check('student wrong password -> 401', sBad.status === 401, sBad.status);
  const sGood = await stu.req('POST', '/api/student/login', { student_name: NAME2, password: 'Pass1234' });
  check('student login (name + password)', sGood.status === 200 && sGood.json.ok, sGood.json.message);
  await stu.session();
  const sPage = await stu.req('GET', '/student/');
  check('/student/ after login -> 200', sPage.status === 200);
  const sAdminPage = await stu.req('GET', '/admin/');
  check('student cannot open /admin/ (redirect)', sAdminPage.status === 302, sAdminPage.status);
  const sMe = await stu.req('GET', '/api/student/me');
  check('/api/student/me returns only own data', sMe.json.ok && sMe.json.me.name === NAME2 && sMe.json.me.score === 88 && !('students' in sMe.json));
  const sApi = await stu.req('GET', '/api/admin');
  check('student on /api/admin -> 403', sApi.status === 403, sApi.status);
  const sPost = await stu.req('POST', '/api/admin', { action: 'student_delete', id: me.id });
  check('student cannot delete via API -> 403', sPost.status === 403, sPost.status);
  const sOut = await stu.req('POST', '/api/logout', {});
  check('student logout', sOut.status === 200);
  const sAfter = await stu.req('GET', '/api/student/me');
  check('after logout /api/student/me -> 401', sAfter.status === 401, sAfter.status);

  console.log('\nSeeded student (if present)');
  const seed = new Client();
  await seed.session();
  const sl = await seed.req('POST', '/api/student/login', { student_name: SAMPLE_STUDENT, password: SAMPLE_PASS });
  if (sl.status === 200) {
    const m = await seed.req('GET', '/api/student/me');
    check('seeded student can log in and sees own profile', m.json.ok && m.json.me.name === SAMPLE_STUDENT);
  } else {
    console.log('  SKIP  seeded student not available (' + sl.status + ')');
  }

  console.log('\nCSRF on admin API');
  const evil = await admin.req('POST', '/api/admin', { action: 'group_add', name: 'HACK-' + stamp }, { noCsrf: true });
  check('POST /api/admin without CSRF header -> 403', evil.status === 403, evil.status);

  console.log('\nCleanup (delete)');
  const del = await admin.req('POST', '/api/admin', { action: 'student_delete', id: me.id });
  check('delete student', del.status === 200 && del.json.ok, del.json.message);
  const del2 = await admin.req('POST', '/api/admin', { action: 'student_delete', id: me.id });
  check('delete again -> 404', del2.status === 404, del2.status);
  const gDel = await admin.req('POST', '/api/admin', { action: 'group_delete', id: group.id });
  check('delete empty group', gDel.status === 200 && gDel.json.ok, gDel.json.message);

  console.log('\nAdmin logout');
  const out = await admin.req('POST', '/api/logout', {});
  check('admin logout', out.status === 200);
  const after = await admin.req('GET', '/api/admin');
  check('after logout /api/admin -> 401', after.status === 401, after.status);

  console.log(`\nResult: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('Test run crashed:', e.message); process.exit(1); });
