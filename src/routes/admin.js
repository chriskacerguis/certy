// src/routes/admin.js
const express = require("express");
const router = express.Router();
const admin = require("../controllers/adminController");
const audit = require("../controllers/auditController");

router.get("/certs", admin.listCerts);
router.get("/audit", audit.listAudit);

module.exports = router;
