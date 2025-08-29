const pino = require('pino');

const env = process.env.NODE_ENV || 'development';
const level = process.env.LOG_LEVEL || (env === 'production' ? 'info' : 'debug');

const pretty = String(process.env.LOG_PRETTY || 'false').toLowerCase() === 'true';

// In Pino v9+, transport goes inside opts.transport
const opts = { level };
if (pretty) {
  opts.transport = {
    target: 'pino-pretty',
    options: { colorize: true, singleLine: true },
  };
}

module.exports = pino(opts);
