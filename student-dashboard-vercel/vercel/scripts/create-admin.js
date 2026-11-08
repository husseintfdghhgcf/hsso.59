'use strict';
// Creates the FIRST admin account (refuses to run if an admin already exists).
// Usage: npm run admin:create -- <username> <password> ["Full Name"]
const bcrypt = require('bcryptjs');
const { pool, tx } = require('../src/db');
const { strChars } = require('../src/helpers');

(async () => {
  const [username, password, fullName = ''] = process.argv.slice(2);

  if (!username || !password) {
    console.error('Usage: npm run admin:create -- <username> <password> ["Full Name"]');
    process.exit(1);
  }
  if (!/^[A-Za-z0-9_.-]{3,50}$/.test(username)) {
    console.error('Username: 3-50 characters (English letters, digits, . _ - only).');
    process.exit(1);
  }
  const pwBytes = Buffer.byteLength(password);
  if (pwBytes < 8 || pwBytes > 72) {
    console.error('Password must be between 8 and 72 characters.');
    process.exit(1);
  }
  if (strChars(fullName) > 100) {
    console.error('Full name is too long.');
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 10);
  const created = await tx(async (c) => {
    await c.query('LOCK TABLE admins IN EXCLUSIVE MODE'); // two simultaneous runs cannot both create an admin
    const r = await c.query('SELECT COUNT(*) AS c FROM admins');
    if (Number(r.rows[0].c) > 0) return false;
    await c.query('INSERT INTO admins (username, full_name, password_hash) VALUES ($1, $2, $3)', [username, fullName, hash]);
    return true;
  });
  if (!created) {
    console.error('An admin already exists. Refusing to create another one from the command line.');
    await pool.end();
    process.exit(1);
  }
  console.log('Admin "%s" created. You can now sign in at /admin/login.html', username);
  await pool.end();
})().catch((e) => {
  console.error('create-admin failed:', e.message);
  process.exit(1);
});
