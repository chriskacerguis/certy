// src/services/auth/oidc.js
const { Issuer, generators } = require('openid-client');

let cached = null;

function isConfigured() {
  const { OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET, OIDC_REDIRECT_URI } = process.env;
  return !!(OIDC_ISSUER && OIDC_CLIENT_ID && OIDC_CLIENT_SECRET && OIDC_REDIRECT_URI);
}

function configError() {
  const e = new Error(
    'Authentication is not configured. Set OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET, and OIDC_REDIRECT_URI in your .env.'
  );
  e.status = 500;
  e.expose = true;
  return e;
}

function summarizeConnError(err) {
  // openid-client may throw AggregateError with multiple ECONNREFUSED entries
  if (err && (err.code === 'ECONNREFUSED')) return `connection refused (${err.address || ''}:${err.port || ''})`;
  if (err && err.name === 'AggregateError' && Array.isArray(err.errors || err.aggregateErrors)) {
    const first = (err.errors || err.aggregateErrors)[0];
    if (first && first.code === 'ECONNREFUSED') return `connection refused (${first.address || ''}:${first.port || ''})`;
    return 'unable to reach issuer (AggregateError)';
  }
  return 'discovery failed';
}

async function getClient() {
  if (!isConfigured()) throw configError();
  const issuerUrl = process.env.OIDC_ISSUER;
  if (cached?.issuer?.issuer === issuerUrl) return cached.client;

  let issuer;
  try {
    issuer = await Issuer.discover(issuerUrl); // fetches /.well-known/openid-configuration
  } catch (err) {
    const e = new Error(`Cannot reach OIDC issuer at ${issuerUrl}: ${summarizeConnError(err)}`);
    e.status = 502; // Bad Gateway (upstream unavailable)
    e.expose = true;
    e.cause = err;
    throw e;
  }

  const client = new issuer.Client({
    client_id: process.env.OIDC_CLIENT_ID,
    client_secret: process.env.OIDC_CLIENT_SECRET,
    redirect_uris: [process.env.OIDC_REDIRECT_URI],
    response_types: ['code'],
  });
  cached = { issuer, client };
  return client;
}

exports.getAuthUrl = async (req, returnTo = '/') => {
  const client = await getClient();
  const state = generators.state();
  const nonce = generators.nonce();
  req.session.oidc = { state, nonce, returnTo };

  return client.authorizationUrl({
    scope: process.env.OIDC_SCOPES || 'openid profile email',
    state,
    nonce,
  });
};

exports.handleCallback = async (req) => {
  const client = await getClient();
  const params = client.callbackParams(req);
  const { state, nonce, returnTo = '/' } = req.session.oidc || {};
  if (!state || params.state !== state) {
    const e = new Error('Invalid OIDC state'); e.status = 400; e.expose = true; throw e;
  }

  const tokenSet = await client.callback(process.env.OIDC_REDIRECT_URI, params, { state, nonce });

  let profile = tokenSet.claims();
  try {
    const info = await client.userinfo(tokenSet);
    profile = { ...profile, ...info };
  } catch { /* not all providers support userinfo */ }

  const user = {
    sub: profile.sub,
    name: profile.name || profile.preferred_username || profile.email || 'user',
    email: profile.email || null,
    raw: profile,
  };

  return { user, tokenSet, returnTo };
};

exports.isConfigured = () => isConfigured();
