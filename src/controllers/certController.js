const { validationResult } = require('express-validator');
const step = require('../services/stepCaService');
const { createP12 } = require('../services/pkcs12Service');
const { generateKeyAndCsr } = require('../utils/csr');
const { extractSerialDecimal } = require('../utils/x509');
const audit = require('../services/auditService');
const mail = require('../services/mailService');
const { addFlash } = require('../middleware/flash');

// ----- TLS issuance -----
exports.renderIssuePage = async (req, res, next) => {
  try {
    res.render('cert', { csrfToken: req.csrfToken() });
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

// ----- S/MIME issuance -----
exports.renderSmimePage = async (req, res, next) => {
  try {
    const smtpHost = (process.env.SMTP_HOST || '').trim();
    const smtpConfigured = smtpHost.length > 0;
    res.render('smime', { csrfToken: req.csrfToken(), smtpConfigured });
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

// ----- Renewal -----
exports.renderRenewPage = async (req, res, next) => {
  try { res.render('renew', { csrfToken: req.csrfToken() }); } catch (e) { next(e); }
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

// ----- Revocation -----
exports.renderRevokePage = async (req, res, next) => {
  try { res.render('revoke', { csrfToken: req.csrfToken() }); } catch (e) { next(e); }
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
    const serial = extractSerialDecimal(certPem);

    if (keyPem) {
      await step.revokeWithMTLS({ certPem, keyPem, reason, reasonCode });
    } else {
      await step.revokeBySerialToken({ serial, reason, reasonCode });
    }

    audit.event('REVOKE_CERT', { serial, reasonCode, reason: reason?.slice(0, 120) });

    res.render('layout', { body: `<div class="alert alert-warning">Certificate revoked (serial ${serial}).</div>` });
  } catch (e) { next(e); }
};
