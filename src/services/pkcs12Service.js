// src/services/pkcs12Service.js
const forge = require("node-forge");
const { pki, pkcs12, util } = forge;

exports.createP12 = async ({ certPem, privateKeyPem, caPem, password }) => {
  const cert = pki.certificateFromPem(certPem);
  const key = pki.privateKeyFromPem(privateKeyPem);

  const caCerts = [];
  if (caPem) {
    const parts =
      String(caPem).match(
        /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g,
      ) || [];
    for (const p of parts) caCerts.push(pki.certificateFromPem(p));
  }

  const bags = [
    {
      friendlyName: cert.subject.getField("CN")?.value || "S/MIME",
      key,
      cert,
      localKeyId: util.hexToBytes("01"),
      bagAttribute: {},
    },
  ];

  const p12Asn1 = pkcs12.toPkcs12Asn1(key, cert, password, {
    algorithm: "3des",
    friendlyName: "S/MIME",
    certChain: caCerts,
  });
  const p12Der = asn1ToBuffer(p12Asn1);
  return p12Der;
};

function asn1ToBuffer(asn1) {
  const der = forge.asn1.toDer(asn1).getBytes();
  return Buffer.from(der, "binary");
}
