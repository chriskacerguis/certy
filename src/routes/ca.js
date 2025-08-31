const express = require('express');
const router = express.Router();
const ca = require('../controllers/caController');
const { body } = require('express-validator');

// Page
router.get('/', ca.renderPage);

// Lifecycle
router.post(
  '/init',
  body('name').isLength({ min: 1 }).withMessage('Name is required'),
  ca.initCA
);
router.post('/destroy', ca.destroyCA);
router.post('/rotate-keystore', ca.rotateKeystoreSecret);

// Downloads
router.get('/download/root', ca.downloadRoot);
router.get('/download/intermediate', ca.downloadIntermediate);
router.get('/download/crl', ca.downloadCRL);

// Publish CRL to S3
router.post('/publish/crl', ca.publishCRLToS3);

module.exports = router;
