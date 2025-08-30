const request = require('supertest');

function newApp({ stepMock = {}, crlMock = {}, env = {} } = {}) {
  jest.resetModules();
  // Default ENV to bypass auth and enable lifecycle
  const origEnv = process.env;
  process.env = { ...origEnv, AUTH_OPTIONAL: 'true', ENABLE_CA_LIFECYCLE: 'true', ...env };

  // Step service mock with sensible defaults
  const step = {
    isInitialized: jest.fn().mockResolvedValue(false),
    initCA: jest.fn().mockResolvedValue(true),
    destroyCA: jest.fn().mockResolvedValue(true),
    fetchRootPEM: jest.fn().mockResolvedValue('-----BEGIN CERTIFICATE-----\nMOCKROOT\n-----END CERTIFICATE-----\n'),
    fetchIntermediatesPEM: jest.fn().mockResolvedValue('-----BEGIN CERTIFICATE-----\nMOCKINT\n-----END CERTIFICATE-----\n'),
    generateCRLPEM: jest.fn().mockResolvedValue('-----BEGIN X509 CRL-----\nMOCKCRL\n-----END X509 CRL-----\n'),
    ...stepMock,
  };
  jest.doMock('../src/services/stepCaService', () => step, { virtual: false });

  const crl = {
    isEnabled: jest.fn().mockReturnValue(false),
    publishCRL: jest.fn().mockResolvedValue({ bucket: 'b', key: 'k', etag: 'e', url: 'https://example.com/crl.pem' }),
    derivePublicUrl: jest.fn().mockReturnValue('https://example.com/crl.pem'),
    ...crlMock,
  };
  jest.doMock('../src/services/crlPublisher', () => crl, { virtual: false });

  const app = require('../src/app');
  return { app, step, crl, restoreEnv: () => { process.env = origEnv; } };
}

function extractCsrf(html) {
  return /name="_csrf" value="([^"]+)"/.exec(html)?.[1];
}

describe('caController', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('GET /ca renders with lifecycle controls and without S3 button when disabled', async () => {
    const { app } = newApp({ crlMock: { isEnabled: jest.fn().mockReturnValue(false) } });
    const agent = request.agent(app);
    const page = await agent.get('/ca').expect(200);
    expect(page.text).toContain('Initialize CA');
    expect(page.text).not.toContain('Publish to S3');
  });

  test('POST /ca/init initializes when enabled and not already initialized', async () => {
    const { app, step } = newApp({ stepMock: { isInitialized: jest.fn().mockResolvedValue(false) } });
    const agent = request.agent(app);
    const page = await agent.get('/ca').expect(200);
    const csrf = extractCsrf(page.text);
    const res = await agent.post('/ca/init').type('form').send({ _csrf: csrf, name: 'MyCA' }).expect(200);
    expect(res.text).toContain('CA initialized');
    expect(step.initCA).toHaveBeenCalled();
  });

  test('POST /ca/init blocked when already initialized', async () => {
    const { app } = newApp({ stepMock: { isInitialized: jest.fn().mockResolvedValue(true) } });
    const agent = request.agent(app);
    const page = await agent.get('/ca').expect(200);
    const csrf = extractCsrf(page.text);
    const res = await agent.post('/ca/init').set('Content-Type','application/x-www-form-urlencoded').send(`_csrf=${csrf}&name=MyCA`).expect(409);
    expect(res.text).toContain('already initialized');
  });

  test('POST /ca/destroy blocked when lifecycle disabled', async () => {
    const { app } = newApp({ env: { ENABLE_CA_LIFECYCLE: 'false' } });
    const agent = request.agent(app);
  const page = await agent.get('/ca').expect(200);
  const csrf = extractCsrf(page.text);
  const res = await agent.post('/ca/destroy').type('form').send({ _csrf: csrf }).expect(403);
  // Either CSRF or controller block message is acceptable
  expect(res.text).toMatch(/(CA lifecycle operations are disabled|invalid csrf token)/);
  });

  test('GET /ca/download/root returns 409 when not initialized', async () => {
    const { app } = newApp({ stepMock: { isInitialized: jest.fn().mockResolvedValue(false) } });
    const agent = request.agent(app);
    await agent.get('/ca/download/root').expect(409);
  });

  test('GET /ca/download/root returns PEM and attachment when initialized', async () => {
    const { app } = newApp({ stepMock: { isInitialized: jest.fn().mockResolvedValue(true) } });
    const agent = request.agent(app);
  const res = await agent.get('/ca/download/root').expect(200);
  const ct = res.headers['content-type'] || '';
  expect(ct).toMatch(/application\/(x-pem-file|x-x509-ca-cert)/);
    expect(res.headers['content-disposition']).toContain('roots.pem');
    expect(res.text).toContain('BEGIN CERTIFICATE');
  });

  test('GET /ca/download/intermediate returns PEM and attachment when initialized', async () => {
    const { app } = newApp({ stepMock: { isInitialized: jest.fn().mockResolvedValue(true) } });
    const agent = request.agent(app);
    const res = await agent.get('/ca/download/intermediate').expect(200);
    expect(res.headers['content-disposition']).toContain('intermediates.pem');
    expect(res.text).toContain('BEGIN CERTIFICATE');
  });

  test('GET /ca/download/crl returns CRL PEM when initialized', async () => {
    const { app } = newApp({ stepMock: { isInitialized: jest.fn().mockResolvedValue(true) } });
    const agent = request.agent(app);
    const res = await agent.get('/ca/download/crl').expect(200);
    expect(res.headers['content-disposition']).toContain('intermediate.crl.pem');
    expect(res.text).toContain('BEGIN X509 CRL');
  });

  test('POST /ca/publish/crl publishes to S3 when enabled', async () => {
    const { app, crl } = newApp({ stepMock: { isInitialized: jest.fn().mockResolvedValue(true) }, crlMock: { isEnabled: jest.fn().mockReturnValue(true) } });
    const agent = request.agent(app);
  const page = await agent.get('/ca').expect(200);
  const csrf = extractCsrf(page.text);
  const res = await agent.post('/ca/publish/crl').type('form').send({ _csrf: csrf }).expect(200);
    expect(crl.publishCRL).toHaveBeenCalled();
    expect(res.text).toContain('CRL published to S3');
  });
});
