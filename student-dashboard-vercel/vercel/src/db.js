'use strict';
const { Pool } = require('pg');
const config = require('./config');

if (!config.databaseUrl) {
  throw new Error('DATABASE_URL is not set. Add it to .env (local) or Vercel Environment Variables.');
}

const url = config.databaseUrl;
const isLocal = /@(localhost|127\.0\.0\.1)(:|\/|$)/.test(url);
const hasSslMode = /[?&]sslmode=/.test(url);

// Module-level pool: reused between invocations of a warm serverless function.
// Keep it tiny - each function instance only needs a couple of connections.
const pool = new Pool({
  connectionString: url,
  ssl: isLocal || hasSslMode ? undefined : { rejectUnauthorized: false },
  max: config.onVercel ? 3 : 10,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000,
});
pool.on('error', (e) => console.error('[pg pool]', e.message));

/** Run one query, return the rows. */
async function query(text, params) {
  const r = await pool.query(text, params);
  return r.rows;
}

/** Run fn(client) inside a transaction. */
async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, tx };
