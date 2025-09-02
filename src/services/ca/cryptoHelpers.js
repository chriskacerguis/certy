// src/services/ca/cryptoHelpers.js
const crypto = require('node:crypto');
const forge = require('node-forge');
const { pki, asn1 } = forge;

function nodeKeyPairToPEM(alg, bits) {
  if (alg === 'EC') {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
      namedCurve: 'P-256',
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    return { publicKeyPem: publicKey, privateKeyPem: privateKey };
  } else {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: bits,
      publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    });
    return { publicKeyPem: publicKey, privateKeyPem: privateKey };
  }
}

function subjectKeyIdentifier(pubKey) {
  const spki = pki.publicKeyToAsn1(pubKey);
  const der = asn1.toDer(spki).getBytes();
  const hash = forge.md.sha1.create();
  hash.update(der);
  return hash.digest().getBytes();
}

module.exports = { nodeKeyPairToPEM, subjectKeyIdentifier };
