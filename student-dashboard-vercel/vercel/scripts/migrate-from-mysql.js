'use strict';
// OPTIONAL: copies your existing data (admins, groups, students) from the old MySQL database
// into PostgreSQL, keeping ids and password hashes. Run npm run db:init first.
//
// Usage:
//   MYSQL_URL="mysql://user:pass@host:3306/student_dashboard" npm run db:migrate-from-mysql
//
// Sample data created by db:init is replaced by your real data (same ids are overwritten).
const { pool, tx } = require('../src/db');

(async () => {
  const url = process.env.MYSQL_URL;
  if (!url) {
    console.error('Set MYSQL_URL, e.g. mysql://root:@localhost:3306/student_dashboard');
    process.exit(1);
  }
  let mysql;
  try { mysql = require('mysql2/promise'); } catch (e) {
    console.error('Run "npm install" first (mysql2 is a devDependency used only by this script).');
    process.exit(1);
  }
  const my = await mysql.createConnection(url);
  const [admins] = await my.query('SELECT id, username, full_name, password_hash, created_at, last_login_at FROM admins');
  const [groups] = await my.query('SELECT id, name, created_at FROM `groups`');
  const [students] = await my.query('SELECT id, student_code, name, password_hash, group_id, score, avatar, created_at FROM students');
  await my.end();

  await tx(async (c) => {
    await c.query('TRUNCATE students, "groups", admins RESTART IDENTITY CASCADE');
    for (const a of admins) {
      await c.query(
        'INSERT INTO admins (id, username, full_name, password_hash, created_at, last_login_at) VALUES ($1,$2,$3,$4,$5,$6)',
        [a.id, a.username, a.full_name || '', a.password_hash, a.created_at, a.last_login_at]
      );
    }
    for (const g of groups) {
      await c.query('INSERT INTO "groups" (id, name, created_at) VALUES ($1,$2,$3)', [g.id, g.name, g.created_at]);
    }
    for (const s of students) {
      await c.query(
        'INSERT INTO students (id, student_code, name, password_hash, group_id, score, avatar, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [s.id, s.student_code, s.name, s.password_hash, s.group_id, s.score, s.avatar, s.created_at]
      );
    }
    await c.query(`SELECT setval(pg_get_serial_sequence('admins','id'),   GREATEST((SELECT COALESCE(MAX(id),1) FROM admins),1))`);
    await c.query(`SELECT setval(pg_get_serial_sequence('"groups"','id'), GREATEST((SELECT COALESCE(MAX(id),1) FROM "groups"),1))`);
    await c.query(`SELECT setval(pg_get_serial_sequence('students','id'), GREATEST((SELECT COALESCE(MAX(id),1) FROM students),1))`);
  });
  console.log('Migrated: %d admins, %d groups, %d students.', admins.length, groups.length, students.length);
  await pool.end();
})().catch((e) => {
  console.error('migration failed:', e.message);
  process.exit(1);
});
