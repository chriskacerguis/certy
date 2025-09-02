const pinoHttp = require("pino-http");
const cfg = require("../config");

const SAMPLE_RATE = parseInt(cfg.httpLogSampleRate || 10, 10);
const IGNORE_PATHS = new Set(
  String(cfg.httpLogIgnorePaths || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

module.exports = (baseLogger) =>
  pinoHttp({
    logger: baseLogger,

    // Skip noisy endpoints entirely
    autoLogging: {
      ignore: (req) => {
        const url = req.url || "";
        return Array.from(IGNORE_PATHS).some(
          (p) => url === p || url.startsWith(p + "/"),
        );
      },
    },

    // Use bracket notation for hyphenated header names
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        'req.headers["x-forwarded-for"]',
        'res.headers["set-cookie"]',
        "req.body.password",
      ],
      censor: "[REDACTED]",
    },

    // Trim what we serialize so logs are compact
    serializers: {
      req(req) {
        const keepHeaders = {};
        ["host", "user-agent", "accept", "content-type"].forEach((k) => {
          if (req.headers && req.headers[k]) keepHeaders[k] = req.headers[k];
        });
        return {
          method: req.method,
          url: req.url,
          headers: keepHeaders,
          remoteAddress: req.ip,
        };
      },
      res(res) {
        const headers = res.getHeaders ? res.getHeaders() : {};
        const keep = {};
        ["content-type", "content-length"].forEach((k) => {
          if (headers && headers[k]) keep[k] = headers[k];
        });
        return { statusCode: res.statusCode, headers: keep };
      },
      err: pinoHttp.stdSerializers.err,
    },

    // Sample successes, always log warnings/errors
    customLogLevel(req, res, err) {
      if (err) return "error";
      const status = res.statusCode;
      if (status >= 500) return "error";
      if (status >= 400) return "warn";
      if (SAMPLE_RATE > 1 && Math.floor(Math.random() * SAMPLE_RATE) !== 0) {
        return "silent"; // sample 2xx/3xx
      }
      return "info";
    },

    customSuccessMessage(req, res) {
      return `${req.method} ${req.url} -> ${res.statusCode}`;
    },
    customErrorMessage(req, res, err) {
      return `${req.method} ${req.url} -> ${res.statusCode || 500} (${err.message})`;
    },
  });
