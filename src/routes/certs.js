const express = require('express');
const { body } = require('express-validator');
const controller = require('../controllers/certController');

const router = express.Router();

router.get('/new', controller.renderIssuePage);
router.post(
  '/issue',
  [
    body('commonName').isString().trim().isLength({ min: 3 }),
    body('sans').optional().isString(),
    body('days').optional().isInt({ min: 1, max: 825 }),
    body('keyType').optional().isIn(['RSA', 'EC']).default('EC'),
  ],
  controller.issueCertificate
);

router.get('/smime', controller.renderSmimePage);
router.post(
  '/smime',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isString().isLength({ min: 6 }),
    body('name').optional().isString().trim(),
  ],
  controller.issueSmime
);

// Renewal (mTLS)
router.get('/renew', controller.renderRenewPage);
router.post(
  '/renew',
  [
    body('certPem').isString().contains('BEGIN CERTIFICATE'),
    body('keyPem').isString().contains('BEGIN'),
  ],
  controller.renewCertificate
);

// Revocation
router.get('/revoke', controller.renderRevokePage);
router.post(
  '/revoke',
  [
    body('certPem').isString().contains('BEGIN CERTIFICATE'),
    body('keyPem').optional().isString(),
    body('reason').optional().isString().isLength({ max: 200 }),
    body('reasonCode').optional().isInt({ min: 0, max: 10 }),
  ],
  controller.revokeCertificate
);

module.exports = router;
