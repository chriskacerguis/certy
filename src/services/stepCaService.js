// src/services/stepCaService.js
const fs = require('fs');
const path = require('path');
const crypto = require('node:crypto');
const forge = require('node-forge');
const net = require('node:net');
const { db, tx, getMeta, setMeta, allocateSerialHex } = require('./db');

const { pki, md, asn1 } = forge;

const CA_DIR = process.env.LOCAL_CA_DIR || path.join(process.cwd(), '.local-ca');
const DIR_CERTS = path.join(CA_DIR, 'certs');
const DIR_KEYS  = path.join(CA_DIR, 'private');

const FILE_ROOT_CRT = path.join(DIR_CERTS, 'root.crt.pem');
const FILE_INT_CRT  = path.join(DIR_CERTS, 'intermediate.crt.pem');
const FILE_ROOT_KEY = path.join(DIR_KEYS,  'root.key.pem');
const FILE_INT_KEY  = path.join(DIR_KEYS,  'intermediate.key.pem');

// Old JSON files (for one-time migration if present)
const FILE_SERIAL_OLD = path.join(CA_DIR, 'serial.json');
const FILE_INDEX_OLD  = path.join(CA_DIR, 'index.json');

const ROOT_DAYS = parseInt(process.env.CA_ROOT_DAYS || '3650', 10);
const INT_DAYS  = parseInt(process.env.CA_INT_DAYS  || '1825', 10);
const LEAF_DAYS_DEFAULT = parseInt(process.env.CA_LEAF_DAYS || '90', 10);

const ROOT_KEY_BITS = parseInt(process.env.CA_ROOT_KEY_BITS || '4096', 10);
const INT_KEY_BITS  = parseInt(process.env.CA_INT_KEY_BITS  || '3072', 10);

function ensureDirs() {
  [CA_DIR, DIR_CERTS, DIR_KEYS].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true, mode: 0o700 }); });
}

function readIfExists(file) { return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null; }
function writePEM(file, pem) { fs.writeFileSync(file, pem, { mode: 0o600 }); }

function expose(status, message) { const e = new Error(message); e.status = status; e.expose = true; return e; }

function nodeKeyPairToPEM(alg, bits) {
  if (alg === 'EC') {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
      namedCurve: 'P-256',
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    return { publicKeyPem: publicKey, privateKeyPem: privateKey };
  } else {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: bits,
      publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    });
    return { publicKeyPem: publicKey, privateKeyPem: privateKey };
  }
}

function nowPlusDays(days) {
  const nb = new Date(Date.now() - 60_000);
  const na = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return { notBefore: nb, notAfter: na };
}

function subjectAttrs(commonName) {
  return [{ name: 'commonName', value: commonName }];
}

function subjectKeyIdentifier(pubKey) {
  const spki = pki.publicKeyToAsn1(pubKey);
  const der = asn1.toDer(spki).getBytes();
  const hash = forge.md.sha1.create();    // RFC7093 method 1
  hash.update(der);
  return hash.digest().getBytes();
}

function loadRoot() {
  const crt = readIfExists(FILE_ROOT_CRT);
  const key = readIfExists(FILE_ROOT_KEY);
  if (!crt || !key) return null;
  return { cert: pki.certificateFromPem(crt), key: pki.privateKeyFromPem(key), pem: crt };
}

function loadIntermediate() {
  const crt = readIfExists(FILE_INT_CRT);
  const key = readIfExists(FILE_INT_KEY);
  if (!crt || !key) return null;
  return { cert: pki.certificateFromPem(crt), key: pki.privateKeyFromPem(key), pem: crt };
}

function parseSubjectCN(certOrAttrs) {
  const attrs = Array.isArray(certOrAttrs) ? certOrAttrs : certOrAttrs.subject.attributes;
  const cn = attrs.find(a => a.shortName === 'CN' || a.name === 'commonName');
  return cn ? cn.value : '';
}

function sansToJson(altNames) {
  return (altNames || []).map(a => {
    if (a.type === 1) return { type: 'email', value: a.value };
    if (a.type === 2) return { type: 'dns', value: a.value };
    if (a.type === 7) return { type: 'ip', value: a.ip };
    return { type: 'other' };
  });
}

async function migrateFromJsonIfPresent() {
  try {
    if (getMeta('migrated_json') === '1') return;
    const hasOldSerial = fs.existsSync(FILE_SERIAL_OLD);
    const hasOldIndex  = fs.existsSync(FILE_INDEX_OLD);
    if (!hasOldSerial && !hasOldIndex) return;

    tx(() => {
      if (hasOldSerial) {
        const { next } = JSON.parse(fs.readFileSync(FILE_SERIAL_OLD, 'utf8'));
        if (next) setMeta('next_serial', String(next));
      } else if (!getMeta('next_serial')) {
        setMeta('next_serial', '1000');
      }

      if (hasOldIndex) {
        const arr = JSON.parse(fs.readFileSync(FILE_INDEX_OLD, 'utf8'));
        for (const e of arr) {
          if (e.serialHex) {
            db.prepare(`
              INSERT OR IGNORE INTO certs(serial_hex, subject_cn, subject, sans_json, not_before, not_after, renewed_from)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(
              e.serialHex,
              (e.subject || '').split(',').find(s => s.startsWith('CN='))?.slice(3) || null,
              e.subject || null,
              JSON.stringify([]),
              e.notBefore || null,
              e.notAfter || null,
              e.renewedFrom || null
            );
          }
          if (e.serialHex && e.revokedAt) {
            db.prepare(`
              INSERT OR IGNORE INTO revocations(serial_hex, reason, revoked_at) VALUES (?, ?, ?)
            `).run(e.serialHex, e.reason || '', e.revokedAt);
          }
        }
      }
      setMeta('migrated_json', '1');
    });
  } catch (e) {
    // non-fatal; continue
  }
}

// ------------------ Public API (unchanged signatures) ------------------

exports.isInitialized = async () => {
  ensureDirs();
  await migrateFromJsonIfPresent();
  return fs.existsSync(FILE_ROOT_CRT) && fs.existsSync(FILE_INT_CRT) && fs.existsSync(FILE_ROOT_KEY) && fs.existsSync(FILE_INT_KEY);
};

exports.fetchRootPEM = async () => {
  const pem = readIfExists(FILE_ROOT_CRT);
  if (!pem) throw expose(404, 'Root certificate not found');
  return pem;
};

exports.fetchIntermediatesPEM = async () => {
  const pem = readIfExists(FILE_INT_CRT);
  if (!pem) throw expose(404, 'Intermediate certificate not found');
  return pem;
};

exports.initCA = async ({ name, dns }) => {
  ensureDirs();
  if (await exports.isInitialized()) throw expose(409, 'CA is already initialized');

  // Root
  const rootKp = nodeKeyPairToPEM('RSA', ROOT_KEY_BITS);
  const rootPriv = pki.privateKeyFromPem(rootKp.privateKeyPem);
  const rootPub  = pki.publicKeyFromPem(rootKp.publicKeyPem);

  const rootCert = pki.createCertificate();
  rootCert.publicKey = rootPub;
  rootCert.serialNumber = '01';
  const { notBefore: rNB, notAfter: rNA } = nowPlusDays(ROOT_DAYS);
  rootCert.validity.notBefore = rNB;
  rootCert.validity.notAfter  = rNA;
  const rootName = name || 'Local Root CA';
  rootCert.setSubject(subjectAttrs(rootName));
  rootCert.setIssuer(subjectAttrs(rootName));
  rootCert.setExtensions([
    { name: 'basicConstraints', cA: true, pathLenConstraint: 1 },
    { name: 'keyUsage', keyCertSign: true, cRLSign: true },
    { name: 'subjectKeyIdentifier' },
    { name: 'authorityKeyIdentifier', authorityCertIssuer: true, serialNumber: rootCert.serialNumber },
  ]);
  rootCert.sign(rootPriv, md.sha256.create());

  // Intermediate
  const intKp = nodeKeyPairToPEM('RSA', INT_KEY_BITS);
  const intPriv = pki.privateKeyFromPem(intKp.privateKeyPem);
  const intPub  = pki.publicKeyFromPem(intKp.publicKeyPem);

  const intCert = pki.createCertificate();
  intCert.publicKey = intPub;
  intCert.serialNumber = '02';
  const { notBefore: iNB, notAfter: iNA } = nowPlusDays(INT_DAYS);
  intCert.validity.notBefore = iNB;
  intCert.validity.notAfter  = iNA;
  const intCN = (name ? `${name} Intermediate CA` : 'Local Intermediate CA');
  intCert.setSubject(subjectAttrs(intCN));
  intCert.setIssuer(rootCert.subject.attributes);
  intCert.setExtensions([
    { name: 'basicConstraints', cA: true, pathLenConstraint: 0 },
    { name: 'keyUsage', keyCertSign: true, cRLSign: true },
    { name: 'subjectKeyIdentifier' },
    { name: 'authorityKeyIdentifier', keyIdentifier: subjectKeyIdentifier(rootPub) },
  ]);
  intCert.sign(rootPriv, md.sha256.create());

  // Persist
  writePEM(FILE_ROOT_KEY, pki.privateKeyToPem(rootPriv));
  writePEM(FILE_ROOT_CRT, pki.certificateToPem(rootCert));
  writePEM(FILE_INT_KEY,  pki.privateKeyToPem(intPriv));
  writePEM(FILE_INT_CRT,  pki.certificateToPem(intCert));

  // Seed serial counter in DB
  if (!getMeta('next_serial')) setMeta('next_serial', '1000');

  return true;
};

exports.destroyCA = async () => {
  if (fs.existsSync(CA_DIR)) fs.rmSync(CA_DIR, { recursive: true, force: true });
};

// Sign CSR into a leaf certificate
exports.signCsr = async ({ csrPem, subject, sans = [], notAfterDays = LEAF_DAYS_DEFAULT }) => {
  if (!await exports.isInitialized()) throw expose(409, 'CA not initialized');
  const ca = loadIntermediate();

  const csr = pki.certificationRequestFromPem(csrPem);
  if (!csr.verify()) throw expose(400, 'Invalid CSR signature');

  // Combine SANs: CSR + passed
  let altNames = [];
  const extReq = (csr.getAttribute({ name: 'extensionRequest' }) || {}).extensions || [];
  const sanExt = extReq.find(e => e.name === 'subjectAltName');
  if (sanExt?.altNames) altNames = altNames.concat(sanExt.altNames);
  for (const s of (sans || [])) {
    if (!s) continue;
    if (net.isIP(s)) altNames.push({ type: 7, ip: s });
    else if (s.includes('@')) altNames.push({ type: 1, value: s });
    else altNames.push({ type: 2, value: s });
  }

  const cert = pki.createCertificate();
  cert.publicKey = csr.publicKey;
  cert.serialNumber = allocateSerialHex();
  const { notBefore, notAfter } = nowPlusDays(Number(notAfterDays) || LEAF_DAYS_DEFAULT);
  cert.validity.notBefore = notBefore;
  cert.validity.notAfter  = notAfter;

  const subjAttrs = csr.subject?.attributes?.length ? csr.subject.attributes : subjectAttrs(subject || '');
  cert.setSubject(subjAttrs);
  cert.setIssuer(ca.cert.subject.attributes);

  const exts = [
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, keyEncipherment: true, keyAgreement: true, nonRepudiation: true },
    { name: 'extKeyUsage', serverAuth: true, clientAuth: true, emailProtection: true },
    { name: 'subjectKeyIdentifier' },
    { name: 'authorityKeyIdentifier', keyIdentifier: subjectKeyIdentifier(ca.cert.publicKey) },
  ];
  if (altNames.length) exts.push({ name: 'subjectAltName', altNames });
  cert.setExtensions(exts);

  cert.sign(ca.key, md.sha256.create());

  // Record in DB
  tx(() => {
    db.prepare(`
      INSERT INTO certs(serial_hex, subject_cn, subject, sans_json, not_before, not_after, renewed_from)
      VALUES (?, ?, ?, ?, ?, ?, NULL)
    `).run(
      cert.serialNumber,
      parseSubjectCN(cert),
      cert.subject.attributes.map(a=>`${a.shortName || a.name}=${a.value}`).join(','),
      JSON.stringify(sansToJson(altNames)),
      cert.validity.notBefore.toISOString(),
      cert.validity.notAfter.toISOString()
    );
  });

  return pki.certificateToPem(cert);
};

// Renew with same key/subject/SANs
exports.renewWithMTLS = async ({ certPem, keyPem }) => {
  if (!await exports.isInitialized()) throw expose(409, 'CA not initialized');
  const ca = loadIntermediate();

  const old = pki.certificateFromPem(certPem);
  const priv = pki.privateKeyFromPem(keyPem);

  // key ownership check
  const test = md.sha256.create(); test.update('prove-key');
  const sig = priv.sign(test);
  if (!old.publicKey.verify('prove-key', sig)) throw expose(400, 'Provided private key does not match certificate');

  // revoked?
  const r = db.prepare('SELECT 1 FROM revocations WHERE serial_hex=?').get(old.serialNumber);
  if (r) throw expose(409, 'Certificate is revoked');

  const cert = pki.createCertificate();
  cert.publicKey = old.publicKey;
  cert.serialNumber = allocateSerialHex();
  const { notBefore, notAfter } = nowPlusDays(LEAF_DAYS_DEFAULT);
  cert.validity.notBefore = notBefore;
  cert.validity.notAfter  = notAfter;
  cert.setSubject(old.subject.attributes);
  cert.setIssuer(ca.cert.subject.attributes);

  const oldSan = (old.getExtension('subjectAltName') || {}).altNames || [];
  const exts = [
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, keyEncipherment: true, keyAgreement: true, nonRepudiation: true },
    { name: 'extKeyUsage', serverAuth: true, clientAuth: true, emailProtection: true },
    { name: 'subjectKeyIdentifier' },
    { name: 'authorityKeyIdentifier', keyIdentifier: subjectKeyIdentifier(ca.cert.publicKey) },
  ];
  if (oldSan.length) exts.push({ name: 'subjectAltName', altNames: oldSan });
  cert.setExtensions(exts);

  cert.sign(ca.key, md.sha256.create());

  tx(() => {
    db.prepare(`
      INSERT INTO certs(serial_hex, subject_cn, subject, sans_json, not_before, not_after, renewed_from)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      cert.serialNumber,
      parseSubjectCN(cert),
      cert.subject.attributes.map(a=>`${a.shortName || a.name}=${a.value}`).join(','),
      JSON.stringify(sansToJson(oldSan)),
      cert.validity.notBefore.toISOString(),
      cert.validity.notAfter.toISOString(),
      old.serialNumber
    );
  });

  return pki.certificateToPem(cert);
};

// Revocations
exports.revokeWithMTLS = async ({ certPem, keyPem, reason = '' }) => {
  const cert = pki.certificateFromPem(certPem);
  const priv = pki.privateKeyFromPem(keyPem);
  const test = md.sha256.create(); test.update('prove-revoke');
  const sig = priv.sign(test);
  if (!cert.publicKey.verify('prove-revoke', sig)) throw expose(400, 'Private key does not match certificate');

  tx(() => {
    db.prepare(`
      INSERT INTO revocations(serial_hex, reason, revoked_at)
      VALUES (?, ?, ?)
      ON CONFLICT(serial_hex) DO UPDATE SET reason=excluded.reason, revoked_at=excluded.revoked_at
    `).run(cert.serialNumber, reason || '', new Date().toISOString());
  });
};

exports.revokeBySerialToken = async ({ serial, reason = '' }) => {
  if (!serial) throw expose(400, 'Missing serial');
  tx(() => {
    db.prepare(`
      INSERT INTO revocations(serial_hex, reason, revoked_at)
      VALUES (?, ?, ?)
      ON CONFLICT(serial_hex) DO UPDATE SET reason=excluded.reason, revoked_at=excluded.revoked_at
    `).run(serial, reason || '', new Date().toISOString());
  });
};

// Optional CRL (signed by intermediate)
exports.generateCRLPEM = async () => {
  if (!await exports.isInitialized()) throw expose(409, 'CA not initialized');
  const ca = loadIntermediate();

  const rows = db.prepare('SELECT serial_hex, reason, revoked_at FROM revocations').all();
  const revoked = rows.map(r => ({
    serialNumber: r.serial_hex,
    revocationDate: new Date(r.revoked_at),
    reasonCode: 0
  }));

  const crl = pki.createRevocationList();
  crl.signingCertificate = ca.cert;
  crl.signingPrivateKey = ca.key;
  crl.thisUpdate = new Date();
  crl.nextUpdate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  crl.revokedCertificates = revoked;
  crl.sign(ca.key);

  return pki.crlToPem(crl);
};
