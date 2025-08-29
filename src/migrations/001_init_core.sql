PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS certs (
  serial_hex   TEXT PRIMARY KEY,
  subject_cn   TEXT,
  subject      TEXT,
  sans_json    TEXT,
  not_before   TEXT,
  not_after    TEXT,
  renewed_from TEXT
);

CREATE INDEX IF NOT EXISTS idx_certs_cn ON certs(subject_cn);

CREATE TABLE IF NOT EXISTS revocations (
  serial_hex TEXT PRIMARY KEY,
  reason     TEXT,
  revoked_at TEXT NOT NULL
);
