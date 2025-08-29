// src/controllers/acmeController.js
const acme = require('../services/acmeService');

exports.directory = (req, res) => {
  if (!acme.ACME_ENABLE) return res.status(404).json({ error: 'ACME disabled' });
  res.set('Replay-Nonce', acme.issueNonce());
  res.json(acme.directory(req));
};

exports.newNonce = (req, res) => {
  if (!acme.ACME_ENABLE) return res.status(404).end();
  acme.headNewNonce(res);
};

exports.newAccount = (req, res, next) => {
  if (!acme.ACME_ENABLE) return res.status(404).end();
  acme.newAccount(req, res).catch(next);
};

exports.newOrder = (req, res, next) => {
  if (!acme.ACME_ENABLE) return res.status(404).end();
  acme.newOrder(req, res).catch(next);
};

exports.getAuthz = (req, res, next) => {
  if (!acme.ACME_ENABLE) return res.status(404).end();
  try { acme.getAuthz(req, res); } catch (e) { next(e); }
};

exports.postChallenge = (req, res, next) => {
  if (!acme.ACME_ENABLE) return res.status(404).end();
  acme.postChallenge(req, res).catch(next);
};

exports.finalize = (req, res, next) => {
  if (!acme.ACME_ENABLE) return res.status(404).end();
  acme.finalize(req, res).catch(next);
};

exports.getCert = (req, res, next) => {
  if (!acme.ACME_ENABLE) return res.status(404).end();
  acme.getCert(req, res).catch(next);
};
