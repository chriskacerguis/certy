// src/services/acmeService.js
const { calculateJwkThumbprint, importJWK, FlattenedSign, FlattenedVerify, decodeProtectedHeader } = require('jose');
const { db, tx } = require('./db');
const step = require('./stepCaService');

const cfg = require('../config');
const ACME_ENABLE = String(process.env.ACME_ENABLE || 'false').toLowerCase() === 'true';
const HTTP_TIMEOUT = parseInt(cfg.acmeHttpVerifyTimeoutMs || 5000, 10);

/** ---------- Nonce store (in-memory) ---------- **/
const nonces = new Map(); // nonce -> expiresAt
function issueNonce() {
  const buf = crypto.getRandomValues(new Uint8Array(16));
  const b64u = Buffer.from(buf).toString('base64url');
  nonces.set(b64u, Date.now() + 10 * 60 * 1000);
  return b64u;
}
function consumeNonce(n) {
  const exp = nonces.get(n);
  if (!exp) throw acmeErr('badNonce', 400, 'unknown or already used nonce');
  nonces.delete(n);
  if (exp < Date.now()) throw acmeErr('badNonce', 400, 'expired nonce');
}

/** ---------- Helpers ---------- **/
function acmeErr(type, status = 400, detail = '') {
  const e = new Error(detail || type);
  e.status = status;
  e.expose = true;
  e.acme = { type };
  return e;
}
function b64uToBuf(s) { return Buffer.from(s, 'base64url'); }
function derToPem(label, derBuf) {
  const b64 = derBuf.toString('base64');
  const lines = b64.match(/.{1,64}/g).join('\n');
  return `-----BEGIN ${label}-----\n${lines}\n-----END ${label}-----\n`;
}
function baseUrlFromReq(req) {
  const proto = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
  const host = req.headers['host'];
  return `${proto}://${host}/acme`;
}

/** ---------- JWS verification ---------- **/
async function verifyJWS(jws, getAccountByKid) {
  // jws = { protected, payload, signature }
  const prot = JSON.parse(b64uToBuf(jws.protected).toString('utf8'));
  const payload = jws.payload ? JSON.parse(b64uToBuf(jws.payload).toString('utf8')) : {};
  const nonce = prot.nonce;
  if (!nonce) throw acmeErr('badNonce', 400, 'missing nonce');
  consumeNonce(nonce);

  let jwk;
  if (prot.jwk) {
    jwk = prot.jwk; // newAccount
  } else if (prot.kid) {
    const acct = getAccountByKid(prot.kid);
    if (!acct) throw acmeErr('unauthorized', 401, 'unknown account (kid)');
    jwk = JSON.parse(acct.jwk_json);
  } else {
    throw acmeErr('malformed', 400, 'protected header must include jwk or kid');
  }

  const key = await importJWK(jwk);
  try {
    await new FlattenedVerify(jws).verify(key);
  } catch {
    throw acmeErr('unauthorized', 401, 'JWS signature invalid');
  }
  return { header: prot, payload, jwk };
}

/** ---------- Public endpoints logic ---------- **/
function directory(req) {
  const base = baseUrlFromReq(req);
  return {
    newNonce: `${base}/new-nonce`,
    newAccount: `${base}/new-account`,
    newOrder: `${base}/new-order`,
    revokeCert: `${base}/revoke-cert`,
    keyChange: `${base}/key-change`
  };
}

function headNewNonce(res) {
  res.set('Replay-Nonce', issueNonce());
  res.status(200).end();
}

function getAccountByKid(kid) {
  return db.prepare('SELECT * FROM acme_accounts WHERE kid=?').get(kid);
}

async function newAccount(req, res) {
  const jws = req.acmeJws;
  const { header, payload, jwk } = await verifyJWS(jws, getAccountByKid);

  // If kid present, treat as existing
  if (header.kid) {
    const acct = getAccountByKid(header.kid);
    if (!acct) throw acmeErr('unauthorized', 401);
    return respondAccount(res, acct, 200);
  }

  // create new account (jwk case)
  const kid = `${baseUrlFromReq(req)}/acct/${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  const contact = Array.isArray(payload.contact) ? JSON.stringify(payload.contact) : null;
  const row = tx(() => {
    db.prepare(`
      INSERT INTO acme_accounts(kid, jwk_json, contact_json, created_at)
      VALUES (?, ?, ?, ?)
    `).run(kid, JSON.stringify(jwk), contact, new Date().toISOString());
    return db.prepare('SELECT * FROM acme_accounts WHERE kid=?').get(kid);
  });
  res.status(201);
  return respondAccount(res, row, 201);
}

function respondAccount(res, acct, status) {
  res.set('Location', acct.kid);
  res.set('Replay-Nonce', issueNonce());
  res.status(status || 200).json({
    status: 'valid',
    contact: acct.contact_json ? JSON.parse(acct.contact_json) : [],
    orders: `${acct.kid}/orders`
  });
}

async function newOrder(req, res) {
  const jws = req.acmeJws;
  const { header, payload } = await verifyJWS(jws, getAccountByKid);

  const acct = getAccountByKid(header.kid || '');
  if (!acct) throw acmeErr('unauthorized', 401);

  const identifiers = payload.identifiers || [];
  if (!Array.isArray(identifiers) || identifiers.length === 0) {
    throw acmeErr('malformed', 400, 'identifiers required');
  }
  // Only dns identifiers supported
  identifiers.forEach(i => { if (i.type !== 'dns') throw acmeErr('unsupportedIdentifier', 400); });

  const base = baseUrlFromReq(req);
  const now = new Date().toISOString();

  const order = tx(() => {
    const finalize = `${base}/finalize/`; // will append id after insert
    const certUrl = `${base}/cert/`;
    const ins = db.prepare(`
      INSERT INTO acme_orders(account_id, status, identifiers_json, finalize_url, cert_url, created_at)
      VALUES (?, 'pending', ?, ?, ?, ?)
    `).run(acct.id, JSON.stringify(identifiers), finalize, certUrl, now);
    const id = ins.lastInsertRowid;

    // fix URLs with id
    const finUrl = `${base}/finalize/${id}`;
    const cUrl = `${base}/cert/${id}`;
    db.prepare(`UPDATE acme_orders SET finalize_url=?, cert_url=? WHERE id=?`).run(finUrl, cUrl, id);

    // create authzs & challenges
    const authzUrls = [];
    for (const ident of identifiers) {
      const authzUrl = `${base}/authz/`;
      const aRes = db.prepare(`
        INSERT INTO acme_authzs(order_id, identifier_type, identifier_value, status, url)
        VALUES (?, ?, ?, 'pending', ?)
      `).run(id, ident.type, ident.value, authzUrl);
      const authzId = aRes.lastInsertRowid;
      const authzFinalUrl = `${base}/authz/${authzId}`;
      db.prepare(`UPDATE acme_authzs SET url=? WHERE id=?`).run(authzFinalUrl, authzId);
      authzUrls.push(authzFinalUrl);

      const token = crypto.randomUUID().replace(/-/g, '');
      const chalUrl = `${base}/challenge/${authzId}`;
      db.prepare(`
        INSERT INTO acme_challenges(authz_id, type, token, status, url)
        VALUES (?, 'http-01', ?, 'pending', ?)
      `).run(authzId, token, chalUrl);
    }

    return {
      id,
      finalize: finUrl,
      certUrl: cUrl,
      authzUrls
    };
  });

  res.set('Replay-Nonce', issueNonce());
  res.status(201).json({
    status: 'pending',
    expires: undefined,
    identifiers,
    authorizations: order.authzUrls,
    finalize: order.finalize
  });
}

function getAuthz(req, res) {
  const id = parseInt(req.params.id, 10);
  const a = db.prepare(`
    SELECT * FROM acme_authzs WHERE id=?
  `).get(id);
  if (!a) throw acmeErr('malformed', 404, 'authz not found');

  const ch = db.prepare(`SELECT * FROM acme_challenges WHERE authz_id=?`).get(id);

  res.set('Replay-Nonce', issueNonce());
  res.json({
    identifier: { type: a.identifier_type, value: a.identifier_value },
    status: a.status,
    expires: a.expires || undefined,
    challenges: [{
      type: 'http-01',
      url: ch.url,
      status: ch.status,
      token: ch.token
    }]
  });
}

async function postChallenge(req, res) {
  const jws = req.acmeJws;
  const { header } = await verifyJWS(jws, getAccountByKid);
  const acct = getAccountByKid(header.kid || '');
  if (!acct) throw acmeErr('unauthorized', 401);

  const authzId = parseInt(req.params.id, 10);
  const a = db.prepare(`SELECT * FROM acme_authzs WHERE id=?`).get(authzId);
  if (!a) throw acmeErr('malformed', 404, 'authz not found');
  const ch = db.prepare(`SELECT * FROM acme_challenges WHERE authz_id=?`).get(authzId);
  if (!ch) throw acmeErr('serverInternal', 500, 'challenge not found');

  // Validate HTTP-01
  const jwk = JSON.parse(acct.jwk_json);
  const thumb = await calculateJwkThumbprint(jwk, 'sha256');
  const keyAuth = `${ch.token}.${thumb}`;

  let ok = false;
  const url = `http://${a.identifier_value}/.well-known/acme-challenge/${ch.token}`;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), HTTP_TIMEOUT);
    const r = await fetch(url, { signal: ctl.signal });
    clearTimeout(t);
    if (r.ok) {
      const body = (await r.text()).trim();
      ok = (body === keyAuth);
    }
  } catch { ok = false; }

  tx(() => {
    db.prepare(`UPDATE acme_challenges SET status=?, validated_at=? WHERE id=?`)
      .run(ok ? 'valid' : 'invalid', new Date().toISOString(), ch.id);
    db.prepare(`UPDATE acme_authzs SET status=? WHERE id=?`)
      .run(ok ? 'valid' : 'pending', a.id);
    // If all authzs valid, bump order to ready
    const row = db.prepare(`SELECT order_id FROM acme_authzs WHERE id=?`).get(a.id);
    const remaining = db.prepare(`SELECT COUNT(*) AS c FROM acme_authzs WHERE order_id=? AND status!='valid'`).get(row.order_id);
    if (remaining.c === 0) {
      db.prepare(`UPDATE acme_orders SET status='ready' WHERE id=?`).run(row.order_id);
    }
  });

  res.set('Replay-Nonce', issueNonce());
  res.json({
    type: 'http-01',
    url: ch.url,
    status: ok ? 'valid' : 'pending',
    token: ch.token
  });
}

async function finalize(req, res) {
  const orderId = parseInt(req.params.id, 10);
  const jws = req.acmeJws;
  const { header, payload } = await verifyJWS(jws, getAccountByKid);

  const order = db.prepare(`SELECT * FROM acme_orders WHERE id=?`).get(orderId);
  if (!order) throw acmeErr('malformed', 404, 'order not found');
  if (order.status !== 'ready' && order.status !== 'pending') throw acmeErr('orderNotReady', 403, 'order not ready');
  if (!payload.csr) throw acmeErr('malformed', 400, 'csr missing');

  const csrDer = b64uToBuf(payload.csr);
  const csrPem = derToPem('CERTIFICATE REQUEST', csrDer);

  // Issue certificate from CSR (uses your Intermediate)
  const leafPem = await step.signCsr({ csrPem });
  // Store and mark valid
  tx(() => {
    db.prepare(`UPDATE acme_orders SET status='valid', csr_der_b64u=?, cert_pem=? WHERE id=?`)
      .run(payload.csr, leafPem, orderId);
  });

  res.set('Replay-Nonce', issueNonce());
  res.status(200).json({
    status: 'valid',
    certificate: `${baseUrlFromReq(req)}/cert/${orderId}`
  });
}

async function getCert(req, res) {
  const id = parseInt(req.params.id, 10);
  const row = db.prepare(`SELECT cert_pem FROM acme_orders WHERE id=?`).get(id);
  if (!row || !row.cert_pem) throw acmeErr('malformed', 404, 'certificate not ready');

  const chain = await step.fetchIntermediatesPEM().catch(() => '');
  const pemChain = `${row.cert_pem.trim()}\n${chain.trim()}\n`;

  res.set('Content-Type', 'application/pem-certificate-chain');
  res.send(pemChain);
}

module.exports = {
  ACME_ENABLE,
  directory,
  headNewNonce,
  newAccount,
  newOrder,
  getAuthz,
  postChallenge,
  finalize,
  getCert,
  issueNonce, // for tests
};
