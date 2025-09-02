// src/middleware/csrf.js
const { doubleCsrf } = require("csrf-csrf");

// Use session secret as base secret; acceptable for double submit pattern
const isProd = process.env.NODE_ENV === "production";
const baseSecret = process.env.SESSION_SECRET || "change_me";
// In dev over http, browsers reject "__Host-" cookies unless Secure is set.
// Use a regular cookie name locally; keep __Host- in production over https.
const csrfCookieName = isProd ? "__Host-csrf" : "csrf";

const { doubleCsrfProtection, generateToken } = doubleCsrf({
  getSecret: () => baseSecret,
  cookieName: csrfCookieName,
  cookieOptions: {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    path: "/",
  },
  // Do not enforce CSRF on safe methods so pages can render and embed a token
  ignoredMethods: ["GET", "HEAD", "OPTIONS"],
  // Allow tokens from body, header, or query for flexibility in tests
  getTokenFromRequest: (req) =>
    (req.body && (req.body._csrf || req.body.csrfToken)) ||
    req.get("x-csrf-token") ||
    (req.query && (req.query._csrf || req.query.csrfToken)),
});

// Attach a shim so existing controllers can call req.csrfToken()
function attachCsrfToken(req, res, next) {
  req.csrfToken = () => generateToken(req, res);
  next();
}

module.exports = {
  csrfProtection: doubleCsrfProtection,
  attachCsrfToken,
  generateToken,
};
