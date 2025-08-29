const forge = require('node-forge');

exports.extractSerialDecimal = (certPem) => {
  const cert = forge.pki.certificateFromPem(certPem);
  const hex = cert.serialNumber; // hex string
  return BigInt('0x' + hex).toString(10);
};
