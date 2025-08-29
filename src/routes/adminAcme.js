// src/routes/adminAcme.js
const express = require('express');
const router = express.Router();
const adminAcme = require('../controllers/adminAcmeController');

router.get('/', adminAcme.list);

module.exports = router;
