const forge = require('node-forge');

const x509 = require('../src/utils/x509');

// Reuse a single keypair for faster tests
let keypair;

function makeSelfSignedCertPem(serialHex) {
  const cert = forge.pki.createCertificate();
  cert.publicKey = keypair.publicKey;
  cert.serialNumber = serialHex;
  const now = new Date();
  cert.validity.notBefore = new Date(now.getTime() - 60_000);
  cert.validity.notAfter = new Date(now.getTime() + 60 * 60 * 1000);
  const attrs = [{ name: 'commonName', value: 'test.local' }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
  ]);
  cert.sign(keypair.privateKey, forge.md.sha256.create());
  return forge.pki.certificateToPem(cert);
}

describe('utils/x509.extractSerialDecimal', () => {
  beforeAll(() => {
    // Small key for speed in tests
    keypair = forge.pki.rsa.generateKeyPair({ bits: 512, workers: 0 });
  });

  test('converts small hex serial to decimal', () => {
    const pem = makeSelfSignedCertPem('0a'); // 10 decimal
    const dec = x509.extractSerialDecimal(pem);
    expect(dec).toBe('10');
  });

  test('handles leading zeros and mixed case hex', () => {
    const pem = makeSelfSignedCertPem('0001aF'); // 0x1AF = 431
    const dec = x509.extractSerialDecimal(pem);
    expect(dec).toBe(String(BigInt('0x0001aF')));
  });

  test('supports very large serial numbers (127-bit, positive)', () => {
    const hex = '7fffffffffffffffffffffffffffffff'; // 2^127 - 1 (msb 0 to avoid sign issues)
    const pem = makeSelfSignedCertPem(hex);
    const dec = x509.extractSerialDecimal(pem);
    expect(dec).toBe((BigInt('0x' + hex)).toString(10));
  });

  test('works with another arbitrary serial', () => {
    const hex = 'ABCDE12345';
    const pem = makeSelfSignedCertPem(hex);
    const dec = x509.extractSerialDecimal(pem);
    expect(dec).toBe((BigInt('0x' + hex)).toString(10));
  });

  test('throws on invalid PEM input', () => {
    expect(() => x509.extractSerialDecimal('not a certificate')).toThrow();
  });
});
