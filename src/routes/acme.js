// src/routes/acme.js
const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/acmeController");

// ACME must accept application/jose+json raw bodies (no CSRF, no auth)
const rawJose = express.raw({ type: "application/jose+json", limit: "1mb" });

// Helper to parse flattened JWS into req.acmeJws
function parseJose(req, _res, next) {
  try {
    const s = req.body.toString("utf8");
    req.acmeJws = JSON.parse(s);
    next();
  } catch (e) {
    next(e);
  }
}

// Directory + Nonce
router.get("/directory", ctrl.directory);
router.head("/new-nonce", ctrl.newNonce);

// JWS POST endpoints
router.post("/new-account", rawJose, parseJose, ctrl.newAccount);
router.post("/new-order", rawJose, parseJose, ctrl.newOrder);
router.get("/authz/:id", ctrl.getAuthz);
router.post("/challenge/:id", rawJose, parseJose, ctrl.postChallenge);
router.post("/finalize/:id", rawJose, parseJose, ctrl.finalize);
router.get("/cert/:id", ctrl.getCert);

module.exports = router;
