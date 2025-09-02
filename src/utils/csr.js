// src/utils/csr.js
const forge = require("node-forge");
const crypto = require("node:crypto");
const net = require("node:net");

const { pki, md } = forge;

exports.generateKeyAndCsr = async ({
  commonName,
  emails = [],
  dns = [],
  keyType = "EC",
}) => {
  const { publicKeyPem, privateKeyPem } = generateKeyPairPEM(keyType);

  const publicKey = pki.publicKeyFromPem(publicKeyPem);
  const privateKey = pki.privateKeyFromPem(privateKeyPem);

  const csr = pki.createCertificationRequest();
  csr.publicKey = publicKey;
  csr.setSubject([{ name: "commonName", value: commonName }]);

  const altNames = [];
  for (const e of emails.filter(Boolean)) altNames.push({ type: 1, value: e });
  for (const name of dns.filter(Boolean)) {
    if (net.isIP(name)) altNames.push({ type: 7, ip: name });
    else altNames.push({ type: 2, value: name });
  }
  const attrs = [];
  if (altNames.length)
    attrs.push({
      name: "extensionRequest",
      extensions: [{ name: "subjectAltName", altNames }],
    });
  csr.setAttributes(attrs);

  csr.sign(privateKey, md.sha256.create());

  const csrPem = pki.certificationRequestToPem(csr);
  return { privateKeyPem, csrPem };
};

function generateKeyPairPEM(keyType) {
  const t = String(keyType || "EC").toUpperCase();
  if (t === "RSA") {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "pkcs1", format: "pem" },
      privateKeyEncoding: { type: "pkcs1", format: "pem" },
    });
    return { publicKeyPem: publicKey, privateKeyPem: privateKey };
  }
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", {
    namedCurve: "P-256",
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return { publicKeyPem: publicKey, privateKeyPem: privateKey };
}
