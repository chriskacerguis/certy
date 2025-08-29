const fs = require('fs');
const path = require('path');
const pino = require('pino');

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
  try {
    auditLogger.info({ type, ...redact(details), ts: new Date().toISOString() });
  } catch {
    // noop
  }
};
