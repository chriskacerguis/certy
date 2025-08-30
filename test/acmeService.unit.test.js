const { db } = require('../src/services/db');

function mockJose() {
  jest.doMock('jose', () => ({
    calculateJwkThumbprint: jest.fn(async () => 'THUMB'),
    importJWK: jest.fn(async () => ({})),
    FlattenedVerify: jest.fn().mockImplementation(() => ({ verify: async () => ({}) })),
  }), { virtual: false });
}

function jws(protectedHeader, payload) {
  const p = Buffer.from(JSON.stringify(protectedHeader), 'utf8').toString('base64url');
  const pl = payload !== undefined ? Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url') : '';
  return { protected: p, payload: pl, signature: 'sig' };
}

describe('acmeService unit', () => {
  afterEach(() => { jest.resetModules(); jest.clearAllMocks(); });

  test('directory and headNewNonce set Replay-Nonce', async () => {
    jest.resetModules();
    const svc = require('../src/services/acmeService');
    const req = { headers: { host: 'example.test' }, secure: false };
    const dir = svc.directory(req);
    expect(dir).toHaveProperty('newNonce');

    const res = { headers: {}, set(k,v){ this.headers[k.toLowerCase()] = v; }, status(c){ this._s=c; return this; }, end(){ this._ended=true; } };
    svc.headNewNonce(res);
    expect(res.headers['replay-nonce']).toBeTruthy();
  });

  test('newAccount creates account and returns 201', async () => {
    process.env.ACME_ENABLE = 'true';
    mockJose();
    jest.resetModules();
    const svc = require('../src/services/acmeService');

    // Seed a nonce the same way the controller would
    const nonce = svc.issueNonce();
    const req = { headers: { host: 'x' }, secure: false, acmeJws: jws({ nonce, alg: 'RS256', jwk: { kty:'RSA', n:'x', e:'AQAB' } }, { contact: [] }) };
    const out = {};
    const res = { status(c){ out.status=c; return this; }, set(){}, json(b){ out.body=b; } };
    await svc.newAccount(req, res);
    expect(out.status).toBe(201);
    // ensure DB row exists
    const row = db.prepare('SELECT * FROM acme_accounts LIMIT 1').get();
    expect(row).toBeTruthy();
  });

  test('bad nonce yields ACME error', async () => {
    process.env.ACME_ENABLE = 'true';
    mockJose();
    jest.resetModules();
    const svc = require('../src/services/acmeService');

    // Do not issue a nonce; use a random one so consumeNonce fails
    const req = { headers: { host: 'x' }, secure: false, acmeJws: jws({ nonce: 'nope', alg: 'RS256', jwk: { kty:'RSA', n:'x', e:'AQAB' } }, {}) };
    const res = { status(){ return this; }, set(){}, json(){} };
    await expect(svc.newAccount(req, res)).rejects.toHaveProperty('acme.type', 'badNonce');
  });
});
