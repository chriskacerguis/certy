PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS acme_accounts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  kid          TEXT UNIQUE NOT NULL,
  jwk_json     TEXT NOT NULL,
  contact_json TEXT,
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS acme_orders (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id       INTEGER NOT NULL,
  status           TEXT NOT NULL,              -- pending|ready|valid|invalid
  identifiers_json TEXT NOT NULL,              -- [{type,value}]
  not_before       TEXT,
  not_after        TEXT,
  finalize_url     TEXT NOT NULL,
  cert_url         TEXT NOT NULL,
  csr_der_b64u     TEXT,
  cert_pem         TEXT,
  created_at       TEXT NOT NULL,
  FOREIGN KEY(account_id) REFERENCES acme_accounts(id)
);

CREATE INDEX IF NOT EXISTS idx_acme_orders_acct ON acme_orders(account_id);

CREATE TABLE IF NOT EXISTS acme_authzs (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id         INTEGER NOT NULL,
  identifier_type  TEXT NOT NULL,              -- dns
  identifier_value TEXT NOT NULL,
  status           TEXT NOT NULL,              -- pending|valid|invalid
  expires          TEXT,
  url              TEXT NOT NULL,
  FOREIGN KEY(order_id) REFERENCES acme_orders(id)
);

CREATE INDEX IF NOT EXISTS idx_acme_authzs_order ON acme_authzs(order_id);

CREATE TABLE IF NOT EXISTS acme_challenges (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  authz_id     INTEGER NOT NULL,
  type         TEXT NOT NULL,                  -- http-01
  token        TEXT NOT NULL,
  status       TEXT NOT NULL,                  -- pending|processing|valid|invalid
  url          TEXT NOT NULL,
  validated_at TEXT,
  FOREIGN KEY(authz_id) REFERENCES acme_authzs(id)
);

CREATE INDEX IF NOT EXISTS idx_acme_chals_authz ON acme_challenges(authz_id);
