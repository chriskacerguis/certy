const { validationResult } = require('express-validator');
const step = require('../services/stepCaService');
const { createP12 } = require('../services/pkcs12Service');
const { generateKeyAndCsr } = require('../utils/csr');
const { extractSerialDecimal } = require('../utils/x509');
const audit = require('../services/auditService');
const mail = require('../services/mailService');
const { addFlash } = require('../middleware/flash');
const { db } = require('../services/db');

const ALLOWED_SORT = {
  serial_hex: 'c.serial_hex',
  subject_cn: 'c.subject_cn',
  not_before: 'c.not_before',
  not_after: 'c.not_after',
  renewed_from: 'c.renewed_from',
  revoked_at: 'r.revoked_at'
};

exports.renderIssuePage = async (req, res, next) => {
  try {
    // Listing params (search/sort/pagination)
    const q = String(req.query.q || '').trim();
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const pageSize = Math.min(100, Math.max(5, parseInt(req.query.pageSize || '10', 10)));

    const sortByReq = String(req.query.sortBy || 'not_after');
    const sortBy = ALLOWED_SORT[sortByReq] ? sortByReq : 'not_after';
    const sortDir = String(req.query.sortDir || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
    const order = `${ALLOWED_SORT[sortBy]} ${sortDir.toUpperCase()}`;

    const like = `%${q}%`;
    const where = q
      ? `WHERE c.serial_hex LIKE @like
         OR c.subject_cn LIKE @like
         OR c.subject LIKE @like
         OR c.sans_json LIKE @like
         OR IFNULL(r.reason,'') LIKE @like`
      : '';

    const countRow = db.prepare(
      `SELECT COUNT(*) AS cnt
       FROM certs c
       LEFT JOIN revocations r ON r.serial_hex = c.serial_hex
       ${where}`
    ).get({ like });

    const total = countRow?.cnt || 0;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const curPage = Math.min(page, totalPages);
    const offset = (curPage - 1) * pageSize;

    const rows = db.prepare(
      `SELECT c.serial_hex, c.subject_cn, c.subject, c.sans_json,
              c.not_before, c.not_after, c.renewed_from,
              r.revoked_at, r.reason
       FROM certs c
       LEFT JOIN revocations r ON r.serial_hex = c.serial_hex
       ${where}
       ORDER BY ${order}
       LIMIT @limit OFFSET @offset`
    ).all({ like, limit: pageSize, offset });

    const pages = [];
    const win = 3;
    const start = Math.max(1, curPage - win);
    const end = Math.min(totalPages, curPage + win);
    for (let i = start; i <= end; i++) pages.push(i);

  res.render('certs/issue', {
      csrfToken: res.locals.csrfToken,
      rows,
      total,
      totalPages,
      page: curPage,
      pageSize,
      pages,
      q,
      qEnc: encodeURIComponent(q),
      sortBy,
      sortDir
    });
  } catch (e) { next(e); }
};

exports.listIssuedJson = async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const pageSize = Math.min(100, Math.max(5, parseInt(req.query.pageSize || '10', 10)));
    const sortByReq = String(req.query.sortBy || 'not_after');
    const sortBy = ALLOWED_SORT[sortByReq] ? sortByReq : 'not_after';
    const sortDir = String(req.query.sortDir || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
    const order = `${ALLOWED_SORT[sortBy]} ${sortDir.toUpperCase()}`;
    const like = `%${q}%`;
    const where = q
      ? `WHERE c.serial_hex LIKE @like
         OR c.subject_cn LIKE @like
         OR c.subject LIKE @like
         OR c.sans_json LIKE @like
         OR IFNULL(r.reason,'') LIKE @like`
      : '';
    const countRow = db.prepare(
      `SELECT COUNT(*) AS cnt FROM certs c LEFT JOIN revocations r ON r.serial_hex = c.serial_hex ${where}`
    ).get({ like });
    const total = countRow?.cnt || 0;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const curPage = Math.min(page, totalPages);
    const offset = (curPage - 1) * pageSize;
    const rows = db.prepare(
      `SELECT c.serial_hex, c.subject_cn, c.subject, c.sans_json,
              c.not_before, c.not_after, c.renewed_from,
              r.revoked_at, r.reason
       FROM certs c
       LEFT JOIN revocations r ON r.serial_hex = c.serial_hex
       ${where} ORDER BY ${order} LIMIT @limit OFFSET @offset`
    ).all({ like, limit: pageSize, offset });
    res.json({ rows, total, totalPages, page: curPage, pageSize, sortBy, sortDir });
  } catch (e) { next(e); }
};

exports.issueCertificate = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res
        .status(400)
        .render('layout', { body: `<div class="alert alert-danger">${errors.array()[0].msg}</div>` });
    }

  let { commonName, sans = '', days = 90, keyType = 'RSA' } = req.body;
  // Coerce unsupported/EC key types to RSA for compatibility with current CSR flow
  keyType = String(keyType || 'RSA').toUpperCase();
  if (keyType !== 'RSA') keyType = 'RSA';
    const sanArr = sans.split(',').map(s => s.trim()).filter(Boolean);

    const { privateKeyPem, csrPem } = await generateKeyAndCsr({
      commonName,
      emails: [],
      dns: sanArr,
  keyType,
    });

    const certPem = await step.signCsr({
      csrPem,
      subject: commonName,
      sans: sanArr,
      notAfterDays: Number(days),
    });
  const intermediatePem = await step.fetchIntermediatesPEM();

  audit.event('ISSUE_CERT', { cn: commonName, sans: sanArr, days: Number(days) });
  // Notify user in UI that the operation succeeded; download will begin immediately.
  addFlash(req, 'success', `Certificate for ${commonName} generated. Your download should begin shortly.`);

  // Return a ZIP with separate files
  const archiver = require('archiver');
  res.setHeader('Content-Type', 'application/zip');
  const safeCN = String(commonName || 'certificate').replace(/[^a-zA-Z0-9_.-]+/g, '_');
  res.setHeader('Content-Disposition', `attachment; filename="${safeCN}.zip"`);
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', err => { throw err; });
  archive.pipe(res);
  archive.append(privateKeyPem, { name: 'private.key' });
  archive.append(csrPem, { name: 'request.csr' });
  archive.append(certPem, { name: 'certificate.pem' });
  archive.append(`${certPem.trim()}\n${intermediatePem.trim()}\n`, { name: 'chain.pem' });
  archive.finalize();
  } catch (e) { next(e); }
};

exports.renderSmimePage = async (req, res, next) => {
  try {
    const smtpHost = (process.env.SMTP_HOST || '').trim();
    const smtpConfigured = smtpHost.length > 0;
  res.render('certs/smime', { csrfToken: res.locals.csrfToken, smtpConfigured });
  } catch (e) { next(e); }
};

exports.issueSmime = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res
        .status(400)
        .render('layout', { body: `<div class="alert alert-danger">${errors.array()[0].msg}</div>` });
    }

    const { email, password, name = email, sendEmail } = req.body;

    // Generate key + CSR; sign via step-ca; bundle to p12
    const { privateKeyPem, csrPem } = await generateKeyAndCsr({
      commonName: name,
      emails: [email],
      dns: [],
      keyType: 'RSA',
    });
    const certPem = await step.signCsr({ csrPem, subject: name, sans: [email], notAfterDays: 365 });
    const intermediatePem = await step.fetchIntermediatesPEM();
    const p12Buffer = await createP12({ certPem, privateKeyPem, caPem: intermediatePem, password });

    audit.event('ISSUE_SMIME', { email });

    // Optional email delivery (block if SMTP not configured or empty)
    if (String(sendEmail || '').toLowerCase() === 'on') {
      const smtpHost = (process.env.SMTP_HOST || '').trim();
      if (!smtpHost) {
        // Explicitly block & log if user tried to send but SMTP isn't configured
        audit.event('EMAIL_SMIME_BLOCKED', { to: email, reason: 'SMTP not configured' });
      } else {
        try {
          await mail.sendSmimeP12({
            to: email,
            p12Buffer: Buffer.from(p12Buffer),
            fileName: `${email}.p12`,
            password,      // only used for recipient guidance; never logged
            displayName: name,
          });
          audit.event('EMAIL_SMIME_SENT', { to: email, attachment: `${email}.p12` });
        } catch (mailErr) {
          // Do not fail issuance—show a friendly message with download link
          req.emailSendError = mailErr;
        }
      }
    }

    // Return the .p12 as a download regardless
    res.setHeader('Content-Type', 'application/x-pkcs12');
    res.setHeader('Content-Disposition', `attachment; filename="${email}.p12"`);

    // If an email failure occurred and client accepts HTML, render a banner + download
    if (req.emailSendError && req.accepts('html')) {
      const encoded = Buffer.from(p12Buffer).toString('base64');
      const body = `
        <div class="alert alert-danger mb-3">Certificate issued, but email delivery failed: ${req.emailSendError.message}</div>
        <a class="btn btn-primary" download="${email}.p12" href="data:application/x-pkcs12;base64,${encoded}">Download ${email}.p12</a>
      `;
      return res.status(200).render('layout', { body });
    }

    res.send(Buffer.from(p12Buffer));
  } catch (e) { next(e); }
};

exports.renderRenewPage = async (req, res, next) => {
  try {
    let certPemPrefill = '';
    let keyPemPrefill = '';
    const serial = String(req.query.serial || '').trim();
    if (serial) {
      // Try exact match first
      const row = db.prepare('SELECT cert_pem FROM certs WHERE serial_hex=?').get(serial);
      if (row && row.cert_pem) {
        certPemPrefill = row.cert_pem;
      } else {
        // If the serial provided was an original (and cert was renewed), try to find the newest descendant
        const latest = db.prepare('SELECT cert_pem FROM certs WHERE renewed_from=? ORDER BY not_after DESC LIMIT 1').get(serial);
        if (latest && latest.cert_pem) certPemPrefill = latest.cert_pem;
      }
    }
  res.render('certs/renew', { csrfToken: res.locals.csrfToken, certPemPrefill, keyPemPrefill, serial });
  } catch (e) { next(e); }
};

exports.renewCertificate = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res
        .status(400)
        .render('layout', { body: `<div class="alert alert-danger">${errors.array()[0].msg}</div>` });
    }

    const { certPem, keyPem } = req.body;
    const renewedPem = await step.renewWithMTLS({ certPem, keyPem });

    audit.event('RENEW_CERT', { serial: extractSerialDecimal(certPem) });

    res.setHeader('Content-Type', 'application/x-pem-file');
    res.setHeader('Content-Disposition', 'attachment; filename="renewed.crt.pem"');
    res.send(renewedPem);
  } catch (e) { next(e); }
};

exports.renderRevokePage = async (req, res, next) => {
  try { res.render('certs/revoke', { csrfToken: res.locals.csrfToken }); } catch (e) { next(e); }
};

exports.revokeCertificate = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res
        .status(400)
        .render('layout', { body: `<div class="alert alert-danger">${errors.array()[0].msg}</div>` });
    }

    const { certPem, keyPem = '', reason = '', reasonCode = 0 } = req.body;
    const serial = req.body.serial || (certPem ? extractSerialDecimal(certPem) : '');

    if (certPem && keyPem) {
      await step.revokeWithMTLS({ certPem, keyPem, reason, reasonCode });
    } else if (serial) {
      await step.revokeBySerialToken({ serial, reason, reasonCode });
    }

    audit.event('REVOKE_CERT', { serial, reasonCode, reason: reason?.slice(0, 120) });

    if (req.accepts('json') && (req.get('x-requested-with') === 'fetch' || req.xhr)) {
      return res.json({ ok: true, serial });
    }
    res.render('layout', { body: `<div class="alert alert-warning">Certificate revoked (serial ${serial}).</div>` });
  } catch (e) { next(e); }
};

exports.getCertificateBySerial = async (req, res, next) => {
  try {
    const serial = String(req.params.serial || '').trim();
    if (!serial) return res.status(400).json({ error: 'Missing serial' });
    const row = db.prepare('SELECT cert_pem FROM certs WHERE serial_hex=?').get(serial);
    if (!row || !row.cert_pem) return res.status(404).json({ error: 'Certificate PEM not found' });
    res.json({ certPem: row.cert_pem });
  } catch (e) { next(e); }
};

exports.downloadCertificateBySerial = async (req, res, next) => {
  try {
    const serial = String(req.params.serial || '').trim();
    if (!serial) { const err = new Error('Missing serial'); err.status = 400; err.expose = true; throw err; }
    const row = db.prepare('SELECT cert_pem FROM certs WHERE serial_hex=?').get(serial);
    if (!row || !row.cert_pem) { const err = new Error('Certificate PEM not found'); err.status = 404; err.expose = true; throw err; }
    res.header('Content-Type', 'application/x-pem-file');
    res.attachment(`${serial}.crt.pem`);
    res.send(row.cert_pem);
  } catch (e) { next(e); }
};
