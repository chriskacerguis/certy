const request = require('supertest');
const JSZip = require('jszip');
const fs = require('fs');
const path = require('path');

function freshEnv(extra = {}) {
  for (const k of ['LOCAL_CA_DIR','LOCAL_CA_DB','AUTH_OPTIONAL','ENABLE_CA_LIFECYCLE']) delete process.env[k];
  const TMP = path.join(process.cwd(), '.tmp-e2e');
  const CA_DIR = path.join(TMP, 'ca');
  const DB_PATH = path.join(CA_DIR, 'ca.db');
  if (fs.existsSync(TMP)) fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(CA_DIR, { recursive: true });
  process.env.LOCAL_CA_DIR = CA_DIR;
  process.env.LOCAL_CA_DB = DB_PATH;
  process.env.AUTH_OPTIONAL = 'true';
  process.env.ENABLE_CA_LIFECYCLE = 'true';
  process.env.MIGRATIONS_DIR = path.join(__dirname, '..', 'src', 'migrations');
  Object.assign(process.env, extra);
}

function newApp() {
  jest.resetModules();
  return require('../src/app');
}

function binaryParser(res, callback) {
  res.setEncoding('binary');
  let data = '';
  res.on('data', chunk => { data += chunk; });
  res.on('end', () => { callback(null, Buffer.from(data, 'binary')); });
}

describe('App E2E routes', () => {
  beforeEach(() => freshEnv());

  test('GET / health and index', async () => {
    const app = newApp();
    const agent = request.agent(app);
    await agent.get('/healthz').expect(200).expect('Content-Type', /json/);
  const r = await agent.get('/').expect(200);
  expect(r.text).toContain('Welcome to Certy!');
  });

  test('CA init -> download root/intermediate', async () => {
    const app = newApp();
    const agent = request.agent(app);
    // Render CA page, pick up CSRF
    const page = await agent.get('/ca').expect(200);
    const csrf = /name="_csrf" value="([^"]+)"/.exec(page.text)?.[1];
    expect(csrf).toBeTruthy();
    await agent.post('/ca/init').send(`_csrf=${csrf}&name=E2E%20CA`).set('Content-Type','application/x-www-form-urlencoded').expect(200);
    const root = await agent.get('/ca/download/root').expect(200);
    expect(root.text).toContain('BEGIN CERTIFICATE');
    const intm = await agent.get('/ca/download/intermediate').expect(200);
    expect(intm.text).toContain('BEGIN CERTIFICATE');
  });

  test('Issue TLS -> returns a zip with separate files', async () => {
    const app = newApp();
    const agent = request.agent(app);
    // init CA first
    let page = await agent.get('/ca');
    let csrf = /name="_csrf" value="([^"]+)"/.exec(page.text)?.[1];
    await agent.post('/ca/init').send(`_csrf=${csrf}&name=E2E%20CA`).set('Content-Type','application/x-www-form-urlencoded');

    // issue
    page = await agent.get('/certs/new');
    csrf = /name="_csrf" value="([^"]+)"/.exec(page.text)?.[1];
    const zipRes = await agent
      .post('/certs/issue')
      .set('Content-Type','application/x-www-form-urlencoded')
      .buffer(true).parse(binaryParser)
      .send(`_csrf=${csrf}&commonName=test.local&sans=test.local&days=30&keyType=RSA`)
      .expect(200)
      .expect('Content-Type', /application\/zip/);

    // parse zip
    const zip = await JSZip.loadAsync(zipRes.body);
    const names = Object.keys(zip.files);
    expect(names.sort()).toEqual(['certificate.pem','chain.pem','private.key','request.csr'].sort());
    const certPem = await zip.file('certificate.pem').async('string');
    expect(certPem).toContain('BEGIN CERTIFICATE');
  });

  test('Admin and ACME pages render and ACME disabled returns 404', async () => {
    const app = newApp();
    const agent = request.agent(app);
    await agent.get('/admin/certs').expect(200);
    await agent.get('/admin/acme').expect(200);
    await agent.get('/acme/directory').expect(404);
  });

  test('Auth login bypass is active with AUTH_OPTIONAL=true', async () => {
    const app = newApp();
    const agent = request.agent(app);
    const home = await agent.get('/').expect(200);
    expect(home.text).toContain('Welcome');
  });

  test('Issue S/MIME returns a .p12', async () => {
    const app = newApp();
    const agent = request.agent(app);
    let page = await agent.get('/ca');
    let csrf = /name="_csrf" value="([^"]+)"/.exec(page.text)?.[1];
    await agent.post('/ca/init').send(`_csrf=${csrf}&name=E2E%20CA`).set('Content-Type','application/x-www-form-urlencoded');

    page = await agent.get('/certs/smime').expect(200);
    csrf = /name="_csrf" value="([^"]+)"/.exec(page.text)?.[1];
    const res = await agent
      .post('/certs/smime')
      .set('Content-Type','application/x-www-form-urlencoded')
      .buffer(true).parse(binaryParser)
      .send(`_csrf=${csrf}&email=user@example.com&password=secretpw&name=User`)
      .expect(200)
      .expect('Content-Type', /application\/x-pkcs12/);
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });
});
