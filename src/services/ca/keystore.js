// src/services/ca/keystore.js
// SQLite-backed keystore helpers with optional AES-256-GCM encryption
const crypto = require("node:crypto");
const { db } = require("../db");

function deriveKey(secret) {
  const s = (secret ?? process.env.KEYSTORE_SECRET) || "";
  if (!s || s.length < 8) return null; // disabled or too weak
  return crypto.createHash("sha256").update(s, "utf8").digest();
}

function encMaybe(pem, secret) {
  const key = deriveKey(secret);
  if (!key) return pem;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(pem, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, tag, enc]).toString("base64");
  return "ENCv1:" + payload;
}

function tryDec(str, secret) {
  const key = deriveKey(secret);
  if (!key) return null;
  const raw = Buffer.from(str.slice(6), "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const enc = raw.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString("utf8");
}

function decMaybe(str) {
  if (!str) return null;
  if (!str.startsWith("ENCv1:")) return str;
  // Try current secret first
  let dec = null;
  try {
    dec = tryDec(str, process.env.KEYSTORE_SECRET);
  } catch {
    dec = null;
  }
  if (dec !== null) return dec;
  // Fallback to old secret (during rotation window)
  const old = process.env.KEYSTORE_SECRET_OLD;
  if (old && old.length >= 8) {
    try {
      dec = tryDec(str, old);
    } catch {
      dec = null;
    }
    if (dec !== null) return dec;
  }
  const e = new Error("Unable to decrypt keystore entry with provided secrets");
  e.status = 500;
  e.expose = false;
  throw e;
}

function getPem(name) {
  const row = db.prepare("SELECT pem FROM keystore WHERE name=?").get(name);
  return row ? decMaybe(row.pem) : null;
}

function setPem(name, pem) {
  const val = encMaybe(pem);
  db.prepare(
    `INSERT INTO keystore(name, pem) VALUES(?, ?) ON CONFLICT(name) DO UPDATE SET pem=excluded.pem`,
  ).run(name, val);
}

module.exports = {
  deriveKey,
  encMaybe,
  tryDec,
  decMaybe,
  getPem,
  setPem,
};
