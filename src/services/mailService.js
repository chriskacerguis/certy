const nodemailer = require('nodemailer');

let transporter;

function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true';

  const auth =
    process.env.SMTP_USER || process.env.SMTP_PASS
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined;

  transporter = nodemailer.createTransport({ host, port, secure, auth });
  return transporter;
}

/**
 * Sends an email with the S/MIME .p12 attached
 * @param {Object} opts
 * @param {string} opts.to recipient email
 * @param {Buffer} opts.p12Buffer PKCS#12 buffer
 * @param {string} opts.fileName attachment name (e.g., user@example.com.p12)
 * @param {string} opts.password the p12 password (NOT logged)
 * @param {string} [opts.displayName] human name for body text
 */
exports.sendSmimeP12 = async ({ to, p12Buffer, fileName, password, displayName }) => {
  const from = process.env.SMTP_FROM || 'no-reply@example.com';
  const subject = 'Your S/MIME certificate (.p12)';
  const greeting = displayName ? `Hi ${displayName},` : 'Hello,';
  const text = [
    `${greeting}`,
    '',
    `Attached is your S/MIME certificate bundle (${fileName}).`,
    'How to use:',
    '  1) Save the attachment.',
    '  2) Double-click to import into your keychain/certificate store.',
    '  3) When prompted, enter the password provided during issuance.',
    '',
    'If you did not request this certificate, contact the security team.',
  ].join('\n');

  const mail = {
    from,
    to,
    subject,
    text,
    attachments: [{ filename: fileName, content: p12Buffer, contentType: 'application/x-pkcs12' }],
  };

  const t = getTransporter();
  await t.sendMail(mail);
};
