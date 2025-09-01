// src/routes/auth.js
const express = require('express');
const router = express.Router();
const oidc = require('../services/auth/oidc');

router.get('/login', async (req, res, next) => {
  try {
    const returnTo = req.query.returnTo || '/';
    if (!oidc.isConfigured()) {
      return res.status(500).render('layout', {
        body: `<div class="alert alert-danger">
          Authentication is not configured.<br>
          Please set <code>OIDC_ISSUER</code>, <code>OIDC_CLIENT_ID</code>, <code>OIDC_CLIENT_SECRET</code>, and <code>OIDC_REDIRECT_URI</code> in your <code>.env</code>.
        </div>`
      });
    }
    const url = await oidc.getAuthUrl(req, returnTo);
    res.redirect(url);
  } catch (e) {
    // Friendly message when issuer is down/unreachable
    const msg = e.expose ? e.message : 'OIDC login failed';
    return res.status(e.status || 500).render('layout', {
      body: `<div class="alert alert-danger">
        ${msg}<br>
        <div class="small mt-2">
          Tips:
          <ul class="mb-0">
            <li>Start your dev OIDC on <code>${process.env.OIDC_ISSUER || 'http://localhost:8080'}</code> and ensure it listens on <code>0.0.0.0</code>.</li>
            <li>If it runs in Docker, map the port (e.g., <code>- "8080:8080"</code>) and set <code>OIDC_ISSUER=http://localhost:8080</code> in this app.</li>
          </ul>
        </div>
      </div>`
    });
  }
});

router.get('/callback', async (req, res, next) => {
  try {
    const { user, tokenSet, returnTo } = await oidc.handleCallback(req);
    req.session.user = user;
    req.session.tokens = {
      access_token: tokenSet.access_token,
      id_token: tokenSet.id_token,
      refresh_token: tokenSet.refresh_token
    };
    res.redirect(returnTo || '/');
  } catch (e) { next(e); }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

module.exports = router;
