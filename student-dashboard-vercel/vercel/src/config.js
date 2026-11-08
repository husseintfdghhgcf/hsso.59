'use strict';
require('dotenv').config();

const int = (v, d) => (Number.isFinite(parseInt(v, 10)) ? parseInt(v, 10) : d);
const onVercel = !!process.env.VERCEL;

const config = {
  port: int(process.env.PORT, 3000),
  isProd: process.env.NODE_ENV === 'production' || onVercel,
  onVercel,
  trustProxy: onVercel || String(process.env.TRUST_PROXY || 'false') === 'true',
  databaseUrl: process.env.DATABASE_URL || process.env.POSTGRES_URL || '',
  sessionSecret: process.env.SESSION_SECRET || '',
  sessionTimeout: int(process.env.SESSION_TIMEOUT, 7200), // seconds of inactivity
  sessionMaxAge: 7 * 24 * 3600,                            // absolute limit
  maxFailedLogins: int(process.env.MAX_FAILED_LOGINS, 8),
  lockoutMinutes: int(process.env.LOCKOUT_MINUTES, 15),
};

if (config.sessionSecret.length < 16 || config.sessionSecret.startsWith('change-me')) {
  if (config.isProd) {
    throw new Error('SESSION_SECRET must be set (32+ random characters) in Environment Variables.');
  }
  console.warn('[warn] SESSION_SECRET is missing - using a temporary random one (logins reset on restart).');
  config.sessionSecret = require('crypto').randomBytes(32).toString('hex');
}

module.exports = config;
