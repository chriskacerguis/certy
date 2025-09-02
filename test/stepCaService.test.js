const fs = require("fs");
const path = require("path");

// Use a temp folder per test run
const TMP = path.join(process.cwd(), ".tmp-test");
const CA_DIR = path.join(TMP, "ca");
const DB_PATH = path.join(CA_DIR, "ca.db");

function freshEnv(extra = {}) {
  for (const k of [
    "LOCAL_CA_DIR",
    "LOCAL_CA_DB",
    "KEYSTORE_SECRET",
    "ACME_ENABLE",
    "ENABLE_CA_LIFECYCLE",
  ])
    delete process.env[k];
  process.env.LOCAL_CA_DIR = CA_DIR;
  process.env.LOCAL_CA_DB = DB_PATH;
  process.env.ENABLE_CA_LIFECYCLE = "true";
  Object.assign(process.env, extra);
}

function cleanup() {
  if (fs.existsSync(TMP)) fs.rmSync(TMP, { recursive: true, force: true });
  jest.resetModules();
}

beforeEach(() => {
  cleanup();
  fs.mkdirSync(CA_DIR, { recursive: true });
});

afterAll(() => cleanup());

function loadStep() {
  // ensure a clean module cache between tests
  return require("../src/services/stepCaService");
}

const { generateKeyAndCsr } = require("../src/utils/csr");

describe("stepCaService keystore + issuance", () => {
  test("initCA persists to SQLite keystore and can fetch", async () => {
    freshEnv();
    const step = loadStep();
    expect(await step.isInitialized()).toBe(false);
    await step.initCA({ name: "TestCA" });
    expect(await step.isInitialized()).toBe(true);
    const rootPem = await step.fetchRootPEM();
    const intPem = await step.fetchIntermediatesPEM();
    expect(rootPem).toContain("BEGIN CERTIFICATE");
    expect(intPem).toContain("BEGIN CERTIFICATE");
  });

  test("issue certificate from CSR (RSA)", async () => {
    freshEnv();
    const step = loadStep();
    await step.initCA({ name: "TestCA" });
    const { csrPem } = await generateKeyAndCsr({
      commonName: "unit.local",
      dns: ["unit.local"],
      keyType: "RSA",
    });
    const certPem = await step.signCsr({
      csrPem,
      subject: "unit.local",
      sans: ["unit.local"],
      notAfterDays: 10,
    });
    expect(certPem).toContain("BEGIN CERTIFICATE");
  });

  test("renew + revoke with mTLS", async () => {
    freshEnv();
    const step = loadStep();
    await step.initCA({ name: "TestCA" });
    const { privateKeyPem, csrPem } = await generateKeyAndCsr({
      commonName: "ren.local",
      dns: ["ren.local"],
      keyType: "RSA",
    });
    const issued = await step.signCsr({ csrPem });
    const renewed = await step.renewWithMTLS({
      certPem: issued,
      keyPem: privateKeyPem,
    });
    expect(renewed).toContain("BEGIN CERTIFICATE");
    await step.revokeWithMTLS({
      certPem: renewed,
      keyPem: privateKeyPem,
      reason: "keyCompromise",
    });
    // verify revocation row exists for the renewed cert serial using the shared DB
    const forge = require("node-forge");
    const renewedCert = forge.pki.certificateFromPem(renewed);
    const { db } = require("../src/services/db");
    const r = db
      .prepare("SELECT * FROM revocations WHERE serial_hex=?")
      .get(renewedCert.serialNumber);
    expect(r).toBeTruthy();
  });

  test("KEYSTORE_SECRET encrypts private keys at rest", async () => {
    freshEnv({ KEYSTORE_SECRET: "supersecret!" });
    const step = loadStep();
    await step.initCA({ name: "SecretCA" });
    // Inspect DB content to ensure it is encrypted, not plaintext
    const { db } = require("../src/services/db");
    const rows = db.prepare("SELECT name,pem FROM keystore").all();
    const rootKey = rows.find((r) => r.name === "root_key_pem");
    const intKey = rows.find((r) => r.name === "intermediate_key_pem");
    expect(rootKey.pem.startsWith("ENCv1:")).toBe(true);
    expect(intKey.pem.startsWith("ENCv1:")).toBe(true);
    // And fetching still returns usable PEM
    const rootPem = await step.fetchRootPEM();
    expect(rootPem).toContain("BEGIN CERTIFICATE");
  });
});
