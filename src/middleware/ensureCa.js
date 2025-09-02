const step = require("../services/stepCaService");

module.exports = async function ensureCa(req, res, next) {
  try {
    const ok = await step.isInitialized();
    if (!ok) {
      const err = new Error(
        "The CA is not initialized yet. Initialize the CA before downloading certificates.",
      );
      err.status = 409; // Not ready
      err.expose = true;
      throw err;
    }
    next();
  } catch (e) {
    next(e);
  }
};
