const path = require('path');

// Defaults for rarely changed settings. Advanced users can tweak these.
module.exports = {
  // Logging
  httpLogSampleRate: 10, // 1-in-N successes
  httpLogIgnorePaths: '/healthz,/favicon.ico,/public',

  // Storage
  caDir: path.join(process.cwd(), '.local-ca'),
  caDbPath: null, // derived from caDir when not set
  migrationsDir: path.join(process.cwd(), 'src', 'migrations'),

  // Limits and timeouts
  rateLimitMax: 120,
  auditRetentionDays: 90,
  acmeHttpVerifyTimeoutMs: 5000,

  // CA validity and key sizes
  caRootDays: 3650,
  caIntDays: 1825,
  caLeafDays: 90,    // keep runtime default consistent with previous behavior
  caRootKeyBits: 4096,
  caIntKeyBits: 3072,
};
