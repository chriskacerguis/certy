const fs = require('fs');
const path = require('path');
const pino = require('pino');
const { db } = require('./db');
const { getContext } = require('./auditContext');

const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

const redact = (obj) => {
  const clone = JSON.parse(JSON.stringify(obj || {}));
  const block = '[REDACTED]';
  const redactKeys = ['password', 'privateKeyPem', 'keyPem', 'csr', 'csrPem'];
  for (const k of redactKeys) if (clone[k]) clone[k] = block;
  return clone;
};

const auditLogger = pino({ level: 'info', base: undefined }, pino.destination(path.join(logDir, 'audit.log')));

exports.event = (type, details = {}) => {
  const ts = new Date().toISOString();
  const ctx = getContext();
  const meta = {};
  const uid = ctx?.user?.id || ctx?.user?.sub || null;
  if (ctx && ctx.user) meta.user = { id: uid, name: ctx.user.name, email: ctx.user.email };
  if (ctx && ctx.ip) meta.ip = ctx.ip;
  const safe = redact({ ...meta, ...details });
  // File
  try { auditLogger.info({ type, ...safe, ts }); } catch { /* noop */ }
  // DB
  try {
    db.prepare('INSERT INTO audit_logs(ts, type, details_json, user_id, user_name, user_email, ip) VALUES(?, ?, ?, ?, ?, ?, ?)')
      .run(ts, String(type || ''), JSON.stringify(safe), uid, ctx?.user?.name || null, ctx?.user?.email || null, ctx?.ip || null);
  } catch { /* noop */ }
};
