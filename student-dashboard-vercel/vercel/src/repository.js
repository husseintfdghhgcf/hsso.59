'use strict';
const bcrypt = require('bcryptjs');
const { query, tx } = require('./db');
const { AppException, strChars, cleanText, AVATARS, toInt } = require('./helpers');

const SORT_OPTIONS = {
  scoreDesc: 's.score DESC, s.name ASC, s.id ASC',
  scoreAsc: 's.score ASC, s.name ASC, s.id ASC',
  nameAsc: 's.name ASC, s.id ASC',
  idAsc: 's.id ASC',
};

// PostgreSQL error codes
const UNIQUE_VIOLATION = '23505';
const FK_VIOLATION = '23503';

const round1 = (n) => Math.round((Number(n) || 0) * 10) / 10;

/** Sanitise search / filter / sort input (whitelist based). */
function parseFilters(src) {
  src = src && typeof src === 'object' ? src : {};
  const q = typeof src.q === 'string' ? [...src.q.trim()].slice(0, 100).join('') : '';
  const g = toInt(src.group, 1, 2147483647);
  const group = g !== null ? g : 'ALL';
  const sort = typeof src.sort === 'string' && Object.prototype.hasOwnProperty.call(SORT_OPTIONS, src.sort)
    ? src.sort : 'scoreDesc';
  return { q, group, sort };
}

/** Everything the admin dashboard needs in one payload. Equal scores share the same rank. */
async function buildState(filters) {
  const where = [];
  const params = [];
  if (filters.q !== '') {
    params.push('%' + filters.q.replace(/[!%_]/g, (c) => '!' + c) + '%');
    where.push(`(s.name ILIKE $${params.length} ESCAPE '!' OR s.student_code ILIKE $${params.length} ESCAPE '!')`);
  }
  if (filters.group !== 'ALL') {
    params.push(filters.group);
    where.push(`s.group_id = $${params.length}`);
  }

  const listSql =
    `WITH ranked AS (SELECT id, RANK() OVER (ORDER BY score DESC) AS rk FROM students)
     SELECT s.id, s.student_code, s.name, s.group_id, s.score, s.avatar, g.name AS group_name, r.rk
     FROM students s
     JOIN "groups" g ON g.id = s.group_id
     JOIN ranked r ON r.id = s.id` +
    (where.length ? ' WHERE ' + where.join(' AND ') : '') +
    ' ORDER BY ' + SORT_OPTIONS[filters.sort];

  const [srows, top, aggRows, grows] = await Promise.all([
    query(listSql, params),
    query(
      `SELECT s.id, s.name, s.score, s.avatar, g.name AS group_name
       FROM students s JOIN "groups" g ON g.id = s.group_id
       ORDER BY s.score DESC, s.name ASC, s.id ASC LIMIT 3`
    ),
    query('SELECT COUNT(*) AS c, AVG(score) AS a FROM students'),
    query('SELECT id, name FROM "groups" ORDER BY id ASC'),
  ]);

  const students = srows.map((r) => ({
    id: r.id,
    code: String(r.student_code ?? ''),
    name: r.name,
    group_id: r.group_id,
    group: r.group_name,
    score: r.score,
    avatar: r.avatar,
    rank: Number(r.rk),
  }));
  const podium = top.map((r) => ({ id: r.id, name: r.name, score: r.score, avatar: r.avatar, group: r.group_name }));
  const totalStudents = Number(aggRows[0].c);
  const groups = grows.map((g) => ({ id: g.id, name: g.name }));

  return {
    groups,
    students,
    podium,
    total_students: totalStudents,
    stats: {
      total_students: totalStudents,
      total_groups: groups.length,
      avg_score: totalStudents > 0 ? round1(aggRows[0].a) : 0,
      top_name: podium[0] ? podium[0].name : null,
      top_score: podium[0] ? podium[0].score : 0,
    },
  };
}

function translateDbError(e) {
  if (e && e.code === UNIQUE_VIOLATION) return new AppException('هذا الاسم مسجل مسبقاً، يرجى اختيار اسم مختلف.');
  if (e && e.code === FK_VIOLATION) return new AppException('المجموعة المحددة غير موجودة.');
  return e;
}

/** Create or update a student. Returns the success message. */
async function saveStudent(input) {
  const rawId = input.id;
  const id = rawId === undefined || rawId === null || rawId === '' ? 0 : (toInt(rawId, 0) || 0);

  const name = cleanText(input.name ?? '');
  const len = strChars(name);
  if (len < 2 || len > 120) throw new AppException('اسم الطالب يجب أن يتراوح بين 2 و 120 حرفاً.');

  const score = toInt(input.score, 0, 100);
  if (score === null) throw new AppException('التقييم يجب أن يكون رقماً صحيحاً بين 0 و 100.');

  let avatar = typeof input.avatar === 'string' ? input.avatar : '';
  if (!AVATARS.includes(avatar)) avatar = AVATARS[0];

  const groupId = toInt(input.group_id, 1, 2147483647);
  if (groupId === null) throw new AppException('يرجى اختيار المجموعة.');
  const g = await query('SELECT 1 FROM "groups" WHERE id = $1', [groupId]);
  if (g.length === 0) throw new AppException('المجموعة المحددة غير موجودة.');

  const password = typeof input.password === 'string' ? input.password : '';
  if (id === 0 && password === '') throw new AppException('كلمة مرور الطالب مطلوبة.');
  const pwBytes = Buffer.byteLength(password);
  if (password !== '' && (pwBytes < 6 || pwBytes > 72)) {
    throw new AppException('كلمة المرور يجب أن تتراوح بين 6 و 72 حرفاً.');
  }

  if (id > 0) {
    const ex = await query('SELECT 1 FROM students WHERE id = $1', [id]);
    if (ex.length === 0) throw new AppException('الطالب غير موجود.', 404);
    const p = [name, groupId, score, avatar];
    let sql = 'UPDATE students SET name = $1, group_id = $2, score = $3, avatar = $4, updated_at = now()';
    if (password !== '') {
      p.push(await bcrypt.hash(password, 10));
      sql += `, password_hash = $${p.length}`;
    }
    p.push(id);
    sql += ` WHERE id = $${p.length}`;
    try {
      await query(sql, p);
    } catch (e) {
      throw translateDbError(e);
    }
    return 'تم تعديل بيانات الطالب بنجاح';
  }

  const hash = await bcrypt.hash(password, 10);
  try {
    await tx(async (c) => {
      const ins = await c.query(
        'INSERT INTO students (name, password_hash, group_id, score, avatar) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [name, hash, groupId, score, avatar]
      );
      const newId = ins.rows[0].id;
      await c.query('UPDATE students SET student_code = $1 WHERE id = $2', ['STD-' + (100 + newId), newId]);
    });
  } catch (e) {
    throw translateDbError(e);
  }
  return 'تمت إضافة الطالب الجديد بنجاح';
}

async function deleteStudent(id) {
  const rows = await query('DELETE FROM students WHERE id = $1 RETURNING id', [id]);
  if (rows.length === 0) throw new AppException('الطالب غير موجود.', 404);
  return 'تم حذف الطالب من القائمة';
}

/** Atomically change a score by delta, clamped to 0..100. */
async function adjustScore(id, deltaRaw) {
  const delta = toInt(deltaRaw, -100, 100);
  if (delta === null) throw new AppException('قيمة التعديل غير صحيحة.');
  const rows = await query(
    'UPDATE students SET score = LEAST(100, GREATEST(0, score + $1::int)), updated_at = now() WHERE id = $2 RETURNING name, score',
    [delta, id]
  );
  if (rows.length === 0) throw new AppException('الطالب غير موجود.', 404);
  return 'تم تحديث تقييم ' + rows[0].name + ' إلى ' + rows[0].score + ' نقطة';
}

async function addGroup(nameRaw) {
  const name = cleanText(nameRaw);
  const len = strChars(name);
  if (len < 1 || len > 100) throw new AppException('اسم المجموعة يجب أن يتراوح بين 1 و 100 حرف.');
  try {
    await query('INSERT INTO "groups" (name) VALUES ($1)', [name]);
  } catch (e) {
    if (e && e.code === UNIQUE_VIOLATION) throw new AppException('هذه المجموعة موجودة مسبقاً.');
    throw e;
  }
  return 'تمت إضافة مجموعة "' + name + '"';
}

async function deleteGroup(id) {
  const g = await query('SELECT name FROM "groups" WHERE id = $1', [id]);
  if (g.length === 0) throw new AppException('المجموعة غير موجودة.', 404);
  const msg = 'لا يمكن حذف المجموعة (' + g[0].name + ') لأنها تحتوي على طلاب مسجلين حالياً. قم بنقل الطلاب أولاً.';
  const c = await query('SELECT COUNT(*) AS c FROM students WHERE group_id = $1', [id]);
  if (Number(c[0].c) > 0) throw new AppException(msg);
  try {
    await query('DELETE FROM "groups" WHERE id = $1', [id]);
  } catch (e) {
    if (e && e.code === FK_VIOLATION) throw new AppException(msg); // a student was added concurrently
    throw e;
  }
  return 'تم حذف المجموعة';
}

/** A student's own data + ranking in ONE query. Never exposes other students. */
async function studentProfile(id) {
  const rows = await query(
    `SELECT s.id, s.student_code, s.name, s.score, s.avatar, g.name AS group_name,
            (SELECT COUNT(*) FROM students x WHERE x.score > s.score)                              AS higher,
            (SELECT COUNT(*) FROM students x WHERE x.group_id = s.group_id AND x.score > s.score)  AS group_higher,
            (SELECT COUNT(*) FROM students)                                                         AS total,
            (SELECT COUNT(*) FROM students x WHERE x.group_id = s.group_id)                         AS group_total,
            (SELECT AVG(score) FROM students)                                                       AS avg
     FROM students s JOIN "groups" g ON g.id = s.group_id
     WHERE s.id = $1 LIMIT 1`,
    [id]
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: r.id,
    code: String(r.student_code ?? ''),
    name: r.name,
    score: r.score,
    avatar: r.avatar,
    group: r.group_name,
    rank: 1 + Number(r.higher),
    total: Number(r.total),
    group_rank: 1 + Number(r.group_higher),
    group_total: Number(r.group_total),
    avg: round1(r.avg),
  };
}

async function groupsCount() {
  const rows = await query('SELECT COUNT(*) AS c FROM "groups"');
  return Number(rows[0].c);
}

module.exports = {
  parseFilters, buildState, saveStudent, deleteStudent, adjustScore,
  addGroup, deleteGroup, studentProfile, groupsCount,
};
