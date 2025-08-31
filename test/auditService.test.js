const fs = require('fs');
const path = require('path');

describe('auditService', () => {
  const origCwd = process.cwd();
  const TMP = path.join(process.cwd(), '.tmp-audit');

  beforeEach(() => {
    if (fs.existsSync(TMP)) fs.rmSync(TMP, { recursive: true, force: true });
    fs.mkdirSync(TMP, { recursive: true });
    process.chdir(TMP);
    jest.resetModules();
  });

  afterEach(() => {
    process.chdir(origCwd);
  });

  test('redacts sensitive fields and persists to DB', async () => {
    process.env.NODE_ENV = 'test';
  process.env.MIGRATIONS_DIR = path.join(__dirname, '..', 'src', 'migrations');
    const audit = require('../src/services/auditService');
    const { db } = require('../src/services/db');
    audit.event('TEST', {
      password: 'secret',
      privateKeyPem: 'PEM',
      keyPem: 'PEM',
      csr: 'REQ',
      csrPem: 'REQ',
      keep: 'ok'
    });
    // Read back the last audit row
    const row = db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 1').get();
    expect(row).toBeTruthy();
    const obj = JSON.parse(row.details_json);
    expect(obj.password).toBe('[REDACTED]');
    expect(obj.privateKeyPem).toBe('[REDACTED]');
    expect(obj.keyPem).toBe('[REDACTED]');
    expect(obj.csr).toBe('[REDACTED]');
    expect(obj.csrPem).toBe('[REDACTED]');
    expect(obj.keep).toBe('ok');
    expect(row.type).toBe('TEST');
  });
});
