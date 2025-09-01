const path = require('path');
const defaults = require('./config.defaults');

function bool(v, def = false) {
  if (typeof v === 'boolean') return v;
  const s = String(v || '').toLowerCase();
  if (s === 'true') return true;
  if (s === 'false') return false;
  return def;
}

function int(v, def) {
  const n = parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : def;
}

const cfg = {
  // Logging
  httpLogSampleRate: int(process.env.HTTP_LOG_SAMPLE_RATE, defaults.httpLogSampleRate),
  httpLogIgnorePaths: (process.env.HTTP_LOG_IGNORE_PATHS || defaults.httpLogIgnorePaths),

  // Storage
  caDir: process.env.LOCAL_CA_DIR || defaults.caDir,
  caDbPath: process.env.LOCAL_CA_DB || null, // derived below if null
  migrationsDir: process.env.MIGRATIONS_DIR || defaults.migrationsDir,

  // Limits / timeouts
  rateLimitMax: int(process.env.RATE_LIMIT_MAX, defaults.rateLimitMax),
  auditRetentionDays: int(process.env.AUDIT_RETENTION_DAYS, defaults.auditRetentionDays),
  acmeHttpVerifyTimeoutMs: int(process.env.ACME_HTTP_VERIFY_TIMEOUT_MS, defaults.acmeHttpVerifyTimeoutMs),

  // CA validity and key sizes
  caRootDays: int(process.env.CA_ROOT_DAYS, defaults.caRootDays),
  caIntDays: int(process.env.CA_INT_DAYS, defaults.caIntDays),
  caLeafDays: int(process.env.CA_LEAF_DAYS, defaults.caLeafDays),
  caRootKeyBits: int(process.env.CA_ROOT_KEY_BITS, defaults.caRootKeyBits),
  caIntKeyBits: int(process.env.CA_INT_KEY_BITS, defaults.caIntKeyBits),
};

if (!cfg.caDbPath) cfg.caDbPath = path.join(cfg.caDir, 'ca.db');

module.exports = cfg;
