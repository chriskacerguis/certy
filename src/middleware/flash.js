// Simple session-based flash messages
function addFlash(req, type, text) {
  if (!req.session) return;
  if (!req.session.flash) req.session.flash = [];
  req.session.flash.push({ type, text });
}

function flashMiddleware(req, res, next) {
  const msgs = (req.session && req.session.flash) || [];
  res.locals.flashMessages = msgs;
  if (req.session) req.session.flash = [];
  next();
}

module.exports = { addFlash, flashMiddleware };
