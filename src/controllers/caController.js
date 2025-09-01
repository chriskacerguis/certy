const { validationResult } = require('express-validator');
const step = require('../services/stepCaService');
const audit = require('../services/auditService');
const crlPublisher = require('../services/crlPublisher');
const { db, getMeta, setMeta } = require('../services/db');

exports.renderPage = async (req, res, next) => {
  try {
    const isInitialized = await step.isInitialized();
    const lifecycleEnabled = String(process.env.ENABLE_CA_LIFECYCLE || '').toLowerCase() === 'true';
    const s3Enabled = crlPublisher.isEnabled();
    const s3PublicUrl = s3Enabled ? crlPublisher.derivePublicUrl() : '';
  const { DB_PATH, CA_DIR } = require('../services/db');
  const hasKeystoreSecretOld = String(process.env.KEYSTORE_SECRET_OLD || '').trim().length > 0;
  const crlLastPublishedAt = getMeta('crl_last_published_at');
  res.render('ca', { csrfToken: req.csrfToken(), isInitialized, lifecycleEnabled, s3Enabled, s3PublicUrl, crlLastPublishedAt, dbPath: DB_PATH, caDir: CA_DIR, migrateJson: String(process.env.MIGRATE_JSON||'false'), hasKeystoreSecretOld });
  } catch (e) {
    next(e);
  }
};

exports.initCA = async (req, res, next) => {
  try {
    if (String(process.env.ENABLE_CA_LIFECYCLE || '').toLowerCase() !== 'true') {
      const err = new Error('CA lifecycle operations are disabled. Set ENABLE_CA_LIFECYCLE=true to allow.');
      err.status = 403; err.expose = true; throw err;
    }

    // HARD BLOCK: if already initialized, do not allow re-init
    if (await step.isInitialized()) {
      res.status(409);
      return res.render('layout', {
        body: `<div class="alert alert-warning">
          The CA is already initialized. Re-initialization is not allowed.<br>
          If you intend to start over, use <strong>Destroy CA Data</strong> (dangerous) and then initialize again.
        </div>`
      });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).render('layout', { body: `<div class="alert alert-danger">${errors.array()[0].msg}</div>` });
    }

    const { name, dns, address } = req.body; // address kept for API compatibility
    await step.initCA({ name, dns, address });
    audit.event('CA_INIT', { name, dns, address });
    res.render('layout', { body: '<div class="alert alert-success">CA initialized.</div>' });
  } catch (e) { next(e); }
};

exports.destroyCA = async (req, res, next) => {
  try {
    if (String(process.env.ENABLE_CA_LIFECYCLE || '').toLowerCase() !== 'true') {
      const err = new Error('CA lifecycle operations are disabled. Set ENABLE_CA_LIFECYCLE=true to allow.');
      err.status = 403; err.expose = true; throw err;
    }
    await step.destroyCA();
    audit.event('CA_DESTROY', {});
  res.render('layout', { body: '<div class="alert alert-warning">CA data wiped (database tables cleared and local CA directory removed).</div>' });
  } catch (e) { next(e); }
};

exports.downloadRoot = async (req, res, next) => {
  try {
    const ok = await step.isInitialized();
    if (!ok) {
      const err = new Error('The CA is not initialized yet. Initialize the CA before downloading root certificates.');
      err.status = 409; err.expose = true; throw err;
    }
    const pem = await step.fetchRootPEM();
    audit.event('DOWNLOAD_ROOT', {});
    res.header('Content-Type', 'application/x-pem-file');
    res.attachment('roots.pem');
    res.send(pem);
  } catch (e) { next(e); }
};

exports.downloadIntermediate = async (req, res, next) => {
  try {
    const ok = await step.isInitialized();
    if (!ok) {
      const err = new Error('The CA is not initialized yet. Initialize the CA before downloading intermediate certificates.');
      err.status = 409; err.expose = true; throw err;
    }
    const pem = await step.fetchIntermediatesPEM();
    audit.event('DOWNLOAD_INTERMEDIATE', {});
    res.header('Content-Type', 'application/x-pem-file');
    res.attachment('intermediates.pem');
    res.send(pem);
  } catch (e) { next(e); }
};

exports.downloadCRL = async (req, res, next) => {
  try {
    const ok = await step.isInitialized();
    if (!ok) {
      const err = new Error('The CA is not initialized yet. Initialize the CA before downloading a CRL.');
      err.status = 409; err.expose = true; throw err;
    }
    const crlPem = await step.generateCRLPEM(); // signed by Intermediate
    audit.event('DOWNLOAD_CRL', {});
    res.header('Content-Type', 'application/x-pem-file');
    res.attachment('intermediate.crl.pem');
    res.send(crlPem);
  } catch (e) { next(e); }
};

exports.publishCRLToS3 = async (req, res, next) => {
  try {
    const ok = await step.isInitialized();
    if (!ok) {
      const err = new Error('The CA is not initialized yet. Initialize the CA before publishing a CRL.');
      err.status = 409; err.expose = true; throw err;
    }
    if (!crlPublisher.isEnabled()) {
      const err = new Error('S3 CRL publishing is not enabled. Set S3_CRL_ENABLE=true and required S3 vars.');
      err.status = 400; err.expose = true; throw err;
    }
    const crlPem = await step.generateCRLPEM();
    const out = await crlPublisher.publishCRL(crlPem);
    audit.event('PUBLISH_CRL_S3', { bucket: out.bucket, key: out.key, etag: out.etag });
    try {
      setMeta('crl_last_published_at', new Date().toISOString());
      if (out?.url) setMeta('crl_last_published_url', out.url);
      if (out?.etag) setMeta('crl_last_published_etag', out.etag);
    } catch (_) { /* ignore meta errors */ }
    res.render('layout', {
      body: `
      <div class="alert alert-success">
        CRL published to S3.<br>
        <div class="mt-2"><a class="btn btn-sm btn-outline-primary" href="${out.url}" target="_blank" rel="noopener">View public CRL</a></div>
      </div>`
    });
  } catch (e) { next(e); }
};

exports.rotateKeystoreSecret = async (req, res, next) => {
  try {
    if (String(process.env.ENABLE_CA_LIFECYCLE || '').toLowerCase() !== 'true') {
      const err = new Error('CA lifecycle operations are disabled. Set ENABLE_CA_LIFECYCLE=true to allow.');
      err.status = 403; err.expose = true; throw err;
    }
    const result = await step.rotateKeystoreSecret();
    const msg = `Keystore secret rotation complete. Rotated ${result.rotated}/${result.total} entries.`;
    return res.render('layout', { body: `<div class="alert alert-success">${msg}</div>` });
  } catch (e) { next(e); }
};
