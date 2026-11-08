'use strict';
// Creates the tables + sample data in PostgreSQL (uses DATABASE_URL).
// Usage: npm run db:init
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/db');

(async () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.pg.sql'), 'utf8');
  await pool.query(sql); // multiple statements, no parameters -> simple query protocol
  console.log('Database is ready (tables + sample data).');
  console.log('Sample students use the temporary password: Student@2026');
  console.log('Next step: npm run admin:create -- <username> <password> ["Full Name"]');
  await pool.end();
})().catch((e) => {
  console.error('init-db failed:', e.message);
  process.exit(1);
});
