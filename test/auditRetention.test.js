const fs = require('fs');
const path = require('path');

describe('audit retention purge', () => {
  const origCwd = process.cwd();
  const TMP = path.join(process.cwd(), '.tmp-audit-retain');

  beforeEach(() => {
    if (fs.existsSync(TMP)) fs.rmSync(TMP, { recursive: true, force: true });
    fs.mkdirSync(TMP, { recursive: true });
    process.chdir(TMP);
    jest.resetModules();
    process.env.NODE_ENV = 'test';
    process.env.MIGRATIONS_DIR = path.join(__dirname, '..', 'src', 'migrations');
  });

  afterEach(() => {
    process.chdir(origCwd);
  });

  test('default 90d keeps recent and deletes old', () => {
    const { db } = require('../src/services/db');
    const audit = require('../src/services/auditService');

    function add(tsIso) {
      db.prepare('INSERT INTO audit_logs(ts, type, details_json) VALUES(?, ?, ?)')
        .run(tsIso, 'TEST', '{}');
    }

    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;

    // older than 90d
    add(new Date(now - 91 * day).toISOString()); // should be purged
    add(new Date(now - 200 * day).toISOString()); // should be purged

    // within 90d
    add(new Date(now - 10 * day).toISOString()); // keep
    add(new Date(now - 0 * day).toISOString()); // keep

    const before = db.prepare('SELECT COUNT(*) as c FROM audit_logs').get().c;
    expect(before).toBe(4);

    const removed = audit.purgeOldAuditLogs();
    expect(removed).toBeGreaterThanOrEqual(2);

    const remaining = db.prepare('SELECT COUNT(*) as c FROM audit_logs').get().c;
    expect(remaining).toBeLessThanOrEqual(2);
  });

  test('respects env override and clamps', () => {
    process.env.AUDIT_RETENTION_DAYS = '7';
    const { db } = require('../src/services/db');
    const audit = require('../src/services/auditService');

    function add(tsIso) {
      db.prepare('INSERT INTO audit_logs(ts, type, details_json) VALUES(?, ?, ?)')
        .run(tsIso, 'TEST', '{}');
    }

    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;

    add(new Date(now - 8 * day).toISOString()); // purge
    add(new Date(now - 6 * day).toISOString()); // keep

    const removed = audit.purgeOldAuditLogs(audit.getRetentionDays());
    expect(removed).toBe(1);

    delete process.env.AUDIT_RETENTION_DAYS;
  });
});
