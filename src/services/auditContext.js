// src/services/auditContext.js
const { AsyncLocalStorage } = require("node:async_hooks");

const als = new AsyncLocalStorage();

function withRequestContext(req, _res, next) {
  const ctx = {
    user: req.session?.user || null,
    ip: req.ip || req.connection?.remoteAddress || null,
  };
  als.run(ctx, () => next());
}

function getContext() {
  return als.getStore() || {};
}

module.exports = { withRequestContext, getContext };
