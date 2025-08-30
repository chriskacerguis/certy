const request = require('supertest');
const path = require('path');
const fs = require('fs');

function b64u(obj) { return Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url'); }
function makeJws(prot, payload) {
  return { protected: b64u(prot), payload: payload ? b64u(payload) : '', signature: 'sig' };
}

function newTmpEnv() {
  const origEnv = process.env;
  const TMP = path.join(process.cwd(), '.tmp-acme-flow');
  const CA_DIR = path.join(TMP, 'ca');
  const DB_PATH = path.join(CA_DIR, 'ca.db');
  if (fs.existsSync(TMP)) fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(CA_DIR, { recursive: true });
  process.env = {
    ...origEnv,
    AUTH_OPTIONAL: 'true',
    ACME_ENABLE: 'true',
    ENABLE_CA_LIFECYCLE: 'true',
    LOCAL_CA_DIR: CA_DIR,
    LOCAL_CA_DB: DB_PATH,
    MIGRATIONS_DIR: path.join(__dirname, '..', 'src', 'migrations'),
    ACME_HTTP_VERIFY_TIMEOUT_MS: '500'
  };
  return { TMP, restore: () => { process.env = origEnv; } };
}

describe.skip('acmeService end-to-end flow (with crypto + http mocks)', () => {
  afterEach(() => { jest.resetModules(); jest.clearAllMocks(); });

  test('newAccount -> newOrder -> authz -> challenge -> finalize -> getCert', async () => {
    const { restore } = newTmpEnv();
  // Ensure fresh module state for env-dependent modules (db, acmeService)
  jest.resetModules();

    // Mock jose to bypass real signature verification and provide a stable thumbprint
    jest.doMock('jose', () => ({
      calculateJwkThumbprint: jest.fn(async () => 'THUMB'),
      importJWK: jest.fn(async () => ({})),
      FlattenedVerify: jest.fn().mockImplementation(() => ({ verify: async () => ({}) })),
    }), { virtual: false });

    // Mock step-ca signing and chain fetch
    jest.doMock('../src/services/stepCaService', () => ({
      signCsr: jest.fn(async () => '-----BEGIN CERTIFICATE-----\nCERT\n-----END CERTIFICATE-----\n'),
      fetchIntermediatesPEM: jest.fn(async () => '-----BEGIN CERTIFICATE-----\nINT\n-----END CERTIFICATE-----\n'),
    }), { virtual: false });

    // Mock global fetch for HTTP-01
    const origFetch = global.fetch;
    global.fetch = jest.fn(async () => ({ ok: true, text: async () => global.__ACME_KEY_AUTH__ || '' }));

  const app = require('../src/app');
    const agent = request.agent(app);

    // directory
    const dir = await agent.get('/acme/directory').expect(200);
    expect(dir.body).toHaveProperty('newNonce');

    // helper to get a nonce
    async function getNonce() {
      const r = await agent.head('/acme/new-nonce').expect(200);
      return r.headers['replay-nonce'];
    }

    const jwk = { kty: 'RSA', n: 'x', e: 'AQAB' };

    // newAccount
    const nonce1 = await getNonce();
    const jws1 = makeJws({ nonce: nonce1, alg: 'RS256', jwk }, { contact: ['mailto:admin@example.com'] });
    const acct = await agent.post('/acme/new-account').set('Content-Type','application/jose+json').send(Buffer.from(JSON.stringify(jws1))).expect(201);
    const kid = acct.headers['location'];
    expect(kid).toBeTruthy();

    // newOrder
    const nonce2 = await getNonce();
    const jws2 = makeJws({ nonce: nonce2, alg: 'RS256', kid }, { identifiers: [{ type: 'dns', value: 'example.com' }] });
    const order = await agent.post('/acme/new-order').set('Content-Type','application/jose+json').send(Buffer.from(JSON.stringify(jws2))).expect(201);
    expect(order.body.authorizations?.length).toBe(1);
    const authzUrl = order.body.authorizations[0];
    const orderFinalize = order.body.finalize;
    const authzId = /\/authz\/(\d+)/.exec(authzUrl)[1];
    const orderId = /\/finalize\/(\d+)/.exec(orderFinalize)[1];

    // getAuthz -> token
    const authz = await agent.get(`/acme/authz/${authzId}`).expect(200);
    const token = authz.body.challenges[0].token;

    // Prepare key authorization response body for HTTP-01
    global.__ACME_KEY_AUTH__ = `${token}.THUMB`;

    // postChallenge
    const nonce3 = await getNonce();
    const jws3 = makeJws({ nonce: nonce3, alg: 'RS256', kid }, {});
    const ch = await agent.post(`/acme/challenge/${authzId}`).set('Content-Type','application/jose+json').send(Buffer.from(JSON.stringify(jws3))).expect(200);
    expect(ch.body.status).toBe('valid');

    // finalize
    const nonce4 = await getNonce();
    const csrDerB64u = Buffer.from('00', 'hex').toString('base64url');
    const jws4 = makeJws({ nonce: nonce4, alg: 'RS256', kid }, { csr: csrDerB64u });
    const fin = await agent.post(`/acme/finalize/${orderId}`).set('Content-Type','application/jose+json').send(Buffer.from(JSON.stringify(jws4))).expect(200);
    expect(fin.body).toHaveProperty('certificate');

    // getCert
    const cert = await agent.get(`/acme/cert/${orderId}`).expect(200);
    expect(cert.headers['content-type']).toContain('application/pem-certificate-chain');
    expect(cert.text).toContain('BEGIN CERTIFICATE');

    // cleanup
    global.fetch = origFetch;
    restore();
  });
});
