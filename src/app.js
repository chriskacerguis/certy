require('dotenv').config();
const path = require('path');
const express = require('express');
const helmet = require('helmet');
// Replaced deprecated csurf with csrf-csrf double submit pattern
const { csrfProtection, attachCsrfToken } = require('./middleware/csrf');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const expressLayouts = require('express-ejs-layouts');
const session = require('express-session');
const { flashMiddleware } = require('./middleware/flash');
const oidcService = require('./services/auth/oidc');

const createHttpLogger = require('./middleware/httpLogger');
const baseLogger = require('./logger');

const caRoutes = require('./routes/ca');
const certRoutes = require('./routes/certs');
const authRoutes = require('./routes/auth'); // has GET /login + /callback, POST /logout
const adminRoutes = require('./routes/admin');
const acmeRoutes = require('./routes/acme');
const adminAcmeRoutes = require('./routes/adminAcme');
const { withRequestContext } = require('./services/auditContext');
const { startAuditRetentionJob } = require('./services/auditService');

const app = express();

// Trust proxy if behind LB/ingress (needed for secure cookies)
if ((process.env.TRUST_PROXY || 'false').toLowerCase() === 'true') {
  app.set('trust proxy', 1);
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout');

app.use('/public', express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(helmet());
// Parse cookies for CSRF token cookie handling
app.use(cookieParser());

// --- QUIETER HTTP LOGGING ---
app.use(createHttpLogger(baseLogger));

// --- Sessions (required for CSRF + auth) ---
app.use(session({
  secret: process.env.SESSION_SECRET || 'change_me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production', // set true behind https
    maxAge: 1000 * 60 * 60 * 8, // 8h
  },
}));

// Flash messages (must be after session)
app.use(flashMiddleware);

// Make user available in all views (fixes "user is not defined")
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// Attach per-request audit context (user and IP) AFTER session so user is available
app.use(withRequestContext);

// Rate limit
const limiter = rateLimit({ windowMs: 60 * 1000, max: parseInt(process.env.RATE_LIMIT_MAX || '120', 10) });
app.use(limiter);

// CSRF: attach token shim and make token available in views
app.use(attachCsrfToken);
// Expose current request path to views for active nav/a11y
app.use((req, res, next) => { res.locals.currentPath = req.path || ''; next(); });
app.use((req, res, next) => {
  // Only generate on safe methods to avoid rotating the cookie before POST validation
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    try { res.locals.csrfToken = req.csrfToken(); } catch (e) { /* ignore until protection middleware runs */ }
  }
  next();
});

// Simple guard for protected areas (optional: add roles)
const AUTH_OPTIONAL = String(process.env.AUTH_OPTIONAL || 'false').toLowerCase() === 'true';
function ensureAuth(req, res, next) {
  if (req.session?.user) return next();

  // Dev convenience: bypass when AUTH_OPTIONAL=true or OIDC is not configured
  if (AUTH_OPTIONAL || !oidcService.isConfigured()) {
    res.locals.authBypassed = true;
    return next();
  }

  const returnTo = encodeURIComponent(req.originalUrl || '/');
  return res.redirect(`/auth/login?returnTo=${returnTo}`);
}

// Public home with CSRF token (for any forms on the page)
app.get('/', csrfProtection, (req, res) => {
  res.render('index', { csrfToken: req.csrfToken() });
});

// Auth routes:
// - GET /auth/login and GET /auth/callback must NOT have CSRF (OIDC redirects)
// - POST /auth/logout SHOULD have CSRF to protect the action
app.use('/auth', (req, res, next) => {
  // Allowlist CSRF only for POST /auth/logout
  if (req.method === 'POST' && req.path === '/logout') {
    return csrfProtection(req, res, next);
  }
  return next();
}, authRoutes);

// Protected app routes (require session + CSRF)
app.use('/ca', ensureAuth, csrfProtection, caRoutes);
app.use('/certs', ensureAuth, csrfProtection, certRoutes);

// Health (no noise, no CSRF)
app.get('/healthz', (req, res) => res.json({ ok: true }));

app.use('/admin', ensureAuth, csrfProtection, adminRoutes);
app.use('/admin/acme', ensureAuth, csrfProtection, adminAcmeRoutes);

app.use('/acme', acmeRoutes);

// Error handler
app.use((err, req, res, next) => {
  req.log?.error(err);
  const status = err.status || 500;
  const message = err.expose ? err.message : 'Unexpected error';
  if (req.accepts('html')) {
    return res.status(status).render('layout', { body: `<div class="alert alert-danger">${message}</div>` });
  }
  res.status(status).json({ error: message });
});

// Export app for tests; only start server if run directly
if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    baseLogger.info(`Express running on http://localhost:${port}`);
  });
}

module.exports = app;

// Kick off background jobs after module export to avoid test interference
startAuditRetentionJob();
