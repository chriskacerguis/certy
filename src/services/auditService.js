const { db } = require('./db');
const { getContext } = require('./auditContext');
const logger = require('../logger');
const cfg = require('../config');

const redact = (obj) => {
  const clone = JSON.parse(JSON.stringify(obj || {}));
  const block = '[REDACTED]';
  const redactKeys = ['password', 'privateKeyPem', 'keyPem', 'csr', 'csrPem'];
  for (const k of redactKeys) if (clone[k]) clone[k] = block;
  return clone;
};

exports.event = (type, details = {}) => {
  const ts = new Date().toISOString();
  const ctx = getContext();
  const meta = {};
  const uid = ctx?.user?.id || ctx?.user?.sub || null;
  if (ctx && ctx.user) meta.user = { id: uid, name: ctx.user.name, email: ctx.user.email };
  if (ctx && ctx.ip) meta.ip = ctx.ip;
  const safe = redact({ ...meta, ...details });
  // DB
  try {
    db.prepare('INSERT INTO audit_logs(ts, type, details_json, user_id, user_name, user_email, ip) VALUES(?, ?, ?, ?, ?, ?, ?)')
      .run(ts, String(type || ''), JSON.stringify(safe), uid, ctx?.user?.name || null, ctx?.user?.email || null, ctx?.ip || null);
  } catch { /* noop */ }
};

// --- Retention purge (default 90 days) ---

function getRetentionDays() {
  const fromCfg = parseInt(String(cfg.auditRetentionDays || ''), 10);
  let days = Number.isFinite(fromCfg) && fromCfg > 0 ? fromCfg : 90;
  if (days < 1) days = 1;
  if (days > 3650) days = 3650;
  return days;
}

function purgeOldAuditLogs(retentionDays = getRetentionDays()) {
  const ms = Math.max(1, retentionDays) * 24 * 60 * 60 * 1000;
  const cutoff = new Date(Date.now() - ms).toISOString();
  const stmt = db.prepare('DELETE FROM audit_logs WHERE ts < ?');
  const info = stmt.run(cutoff);
  return info.changes || 0;
}

let retentionTimer = null;
function startAuditRetentionJob() {
  // Skip scheduling in tests to avoid flakiness/noise
  if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) return;
  try {
    const removed = purgeOldAuditLogs();
    if (removed > 0) logger.info({ removed }, 'audit retention purge on startup');
  } catch (e) {
    logger.warn({ err: e }, 'audit retention purge failed on startup');
  }
  // Run daily
  const dayMs = 24 * 60 * 60 * 1000;
  if (retentionTimer) clearInterval(retentionTimer);
  retentionTimer = setInterval(() => {
    try {
      const removed = purgeOldAuditLogs();
      if (removed > 0) logger.info({ removed }, 'audit retention purge');
    } catch (e) {
      logger.warn({ err: e }, 'audit retention purge failed');
    }
  }, dayMs);
  if (retentionTimer.unref) retentionTimer.unref();
}

module.exports.getRetentionDays = getRetentionDays;
module.exports.purgeOldAuditLogs = purgeOldAuditLogs;
module.exports.startAuditRetentionJob = startAuditRetentionJob;
