exports.requireRole = (role) => (req, res, next) => {
  const roles = req.session?.user?.roles || [];
  if (roles.includes(role)) return next();
  const err = new Error('Forbidden');
  err.status = 403; err.expose = true;
  next(err);
};
