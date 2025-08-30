jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({ sendMail: jest.fn(async () => ({ messageId: 'x' })) }))
}));

describe('mailService', () => {
  const origEnv = process.env;
  beforeEach(() => { jest.resetModules(); });
  afterEach(() => { process.env = origEnv; jest.clearAllMocks(); });

  test('sendSmimeP12 builds an email with correct fields and attachment', async () => {
    process.env = {
      ...origEnv,
      SMTP_HOST: 'localhost',
      SMTP_PORT: '1025',
      SMTP_SECURE: 'false',
      SMTP_FROM: 'Step-CA UI <no-reply@example.com>',
    };

  const service = require('../src/services/mailService');
    const buf = Buffer.from('deadbeef', 'hex');
    await service.sendSmimeP12({
      to: 'user@example.com',
      p12Buffer: buf,
      fileName: 'user@example.com.p12',
      password: 'secretpw',
      displayName: 'User'
    });
  const nm = require('nodemailer');
  expect(nm.createTransport).toHaveBeenCalledWith({
      host: 'localhost',
      port: 1025,
      secure: false,
      auth: undefined
    });

  const transport = nm.createTransport.mock.results[0].value;
    expect(transport.sendMail).toHaveBeenCalled();
    const arg = transport.sendMail.mock.calls[0][0];
    expect(arg.from).toContain('no-reply@example.com');
    expect(arg.to).toBe('user@example.com');
    expect(arg.subject).toContain('S/MIME');
    expect(arg.attachments[0].filename).toBe('user@example.com.p12');
    expect(arg.attachments[0].contentType).toBe('application/x-pkcs12');
    expect(Buffer.isBuffer(arg.attachments[0].content)).toBe(true);
  });

  test('uses SMTP_USER/PASS auth when provided', async () => {
    process.env = {
      ...origEnv,
      SMTP_HOST: 'smtp.local',
      SMTP_PORT: '587',
      SMTP_SECURE: 'false',
      SMTP_USER: 'u',
      SMTP_PASS: 'p',
    };
  const service = require('../src/services/mailService');
    const buf = Buffer.from('00', 'hex');
    await service.sendSmimeP12({ to: 'a@b', p12Buffer: buf, fileName: 'a.p12', password: 'x' });
  const nm = require('nodemailer');
  expect(nm.createTransport).toHaveBeenCalledWith({ host: 'smtp.local', port: 587, secure: false, auth: { user: 'u', pass: 'p' } });
  });
});
