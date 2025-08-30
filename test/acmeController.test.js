const request = require('supertest');

describe('acmeController', () => {
  const origEnv = process.env;

  afterEach(() => {
    process.env = origEnv;
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('returns 404 for all endpoints when ACME is disabled', async () => {
    process.env = { ...origEnv, ACME_ENABLE: 'false' };
    const app = require('../src/app');
    const agent = request.agent(app);

    await agent.get('/acme/directory').expect(404);
    await agent.head('/acme/new-nonce').expect(404);
    await agent.post('/acme/new-account').set('Content-Type','application/jose+json').send(Buffer.from('{}')).expect(404);
    await agent.post('/acme/new-order').set('Content-Type','application/jose+json').send(Buffer.from('{}')).expect(404);
    await agent.get('/acme/authz/1').expect(404);
    await agent.post('/acme/challenge/1').set('Content-Type','application/jose+json').send(Buffer.from('{}')).expect(404);
    await agent.post('/acme/finalize/1').set('Content-Type','application/jose+json').send(Buffer.from('{}')).expect(404);
    await agent.get('/acme/cert/1').expect(404);
  });

  test('delegates to acmeService and sets headers when ACME is enabled', async () => {
    // Mock the service used by the controller
    jest.doMock('../src/services/acmeService', () => {
      const m = {
        ACME_ENABLE: true,
        issueNonce: jest.fn(() => 'nonce123'),
        directory: jest.fn((_req) => ({ newNonce: 'http://x/new-nonce' })),
        headNewNonce: jest.fn((res) => { res.set('Replay-Nonce','head-nonce'); res.status(200).end(); }),
        newAccount: jest.fn(async (_req,res) => { res.status(201).json({ ok: 'account' }); }),
        newOrder: jest.fn(async (_req,res) => { res.status(201).json({ ok: 'order' }); }),
        getAuthz: jest.fn((req,res) => { res.set('Replay-Nonce','nonce2'); res.json({ ok: 'authz', id: req.params.id }); }),
        postChallenge: jest.fn(async (_req,res) => { res.set('Replay-Nonce','nonce3'); res.json({ ok: 'challenge' }); }),
        finalize: jest.fn(async (_req,res) => { res.set('Replay-Nonce','nonce4'); res.status(200).json({ ok: 'finalize' }); }),
        getCert: jest.fn(async (_req,res) => { res.type('application/pem-certificate-chain').send('PEM'); })
      };
      return m;
    }, { virtual: false });

    process.env = { ...origEnv, ACME_ENABLE: 'true' };
    const app = require('../src/app');
    const agent = request.agent(app);

    const dir = await agent.get('/acme/directory').expect(200);
    expect(dir.headers['replay-nonce']).toBe('nonce123');
    expect(dir.body).toHaveProperty('newNonce');

    const nn = await agent.head('/acme/new-nonce').expect(200);
    expect(nn.headers['replay-nonce']).toBe('head-nonce');

    await agent.post('/acme/new-account').set('Content-Type','application/jose+json').send(Buffer.from('{}')).expect(201);
    await agent.post('/acme/new-order').set('Content-Type','application/jose+json').send(Buffer.from('{}')).expect(201);
    const authz = await agent.get('/acme/authz/42').expect(200);
    expect(authz.body).toMatchObject({ ok: 'authz', id: '42' });
    const ch = await agent.post('/acme/challenge/42').set('Content-Type','application/jose+json').send(Buffer.from('{}')).expect(200);
    expect(ch.headers['replay-nonce']).toBe('nonce3');
    await agent.post('/acme/finalize/42').set('Content-Type','application/jose+json').send(Buffer.from('{}')).expect(200);
    const cert = await agent.get('/acme/cert/42').expect(200);
    expect(cert.headers['content-type']).toContain('application/pem-certificate-chain');
  });
});
