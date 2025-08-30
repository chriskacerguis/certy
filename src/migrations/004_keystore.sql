PRAGMA foreign_keys = ON;

-- Stores PEM-encoded CA materials (root/intermediate keys and certs)
CREATE TABLE IF NOT EXISTS keystore (
  name TEXT PRIMARY KEY,    -- e.g., root_key_pem, root_cert_pem, intermediate_key_pem, intermediate_cert_pem
  pem  TEXT NOT NULL
);
