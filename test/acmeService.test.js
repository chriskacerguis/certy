const fs = require('fs');
const path = require('path');
const request = require('supertest');

jest.setTimeout(30000);

describe('acmeService (API surface via routes)', () => {
  const origEnv = process.env;
  const origCwd = process.cwd();
  const TMP = path.join(process.cwd(), '.tmp-acme');

  beforeEach(() => {
  process.env = { ...origEnv, AUTH_OPTIONAL: 'true', ACME_ENABLE: 'true', MIGRATIONS_DIR: path.join(origCwd, 'src', 'migrations') };
    if (fs.existsSync(TMP)) fs.rmSync(TMP, { recursive: true, force: true });
    fs.mkdirSync(TMP, { recursive: true });
    process.chdir(TMP);
    jest.resetModules();
  });

  afterEach(() => {
    process.env = origEnv;
    process.chdir(origCwd);
  });

  test('exposes directory and nonces', async () => {
    const app = require('../src/app');
    const agent = request.agent(app);

    const dir = await agent.get('/acme/directory').expect(200);
    expect(dir.body).toHaveProperty('newNonce');

    const nonceRes = await agent.head('/acme/new-nonce').expect(200);
    expect(nonceRes.headers['replay-nonce']).toBeTruthy();
  });
});
