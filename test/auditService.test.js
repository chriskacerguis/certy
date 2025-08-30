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

  test('redacts sensitive fields', async () => {
    const audit = require('../src/services/auditService');
    audit.event('TEST', {
      password: 'secret',
      privateKeyPem: 'PEM',
      keyPem: 'PEM',
      csr: 'REQ',
      csrPem: 'REQ',
      keep: 'ok'
    });
    const logPath = path.join(TMP, 'logs', 'audit.log');
    // wait briefly for pino to flush to disk
    for (let i = 0; i < 10; i++) {
      if (fs.existsSync(logPath) && fs.statSync(logPath).size > 0) break;
      await new Promise(r => setTimeout(r, 20));
    }
    expect(fs.existsSync(logPath)).toBe(true);
    const lines = fs.readFileSync(logPath, 'utf8').trim().split(/\r?\n/);
    const last = lines.pop();
    const obj = JSON.parse(last);
    expect(obj.type).toBe('TEST');
    expect(obj.password).toBe('[REDACTED]');
    expect(obj.privateKeyPem).toBe('[REDACTED]');
    expect(obj.keyPem).toBe('[REDACTED]');
    expect(obj.csr).toBe('[REDACTED]');
    expect(obj.csrPem).toBe('[REDACTED]');
    expect(obj.keep).toBe('ok');
  });
});
