// src/routes/admin.js
const express = require('express');
const router = express.Router();
const admin = require('../controllers/adminController');

router.get('/certs', admin.listCerts);

module.exports = router;
