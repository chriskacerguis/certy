PRAGMA foreign_keys = ON;

-- Add column to store the issued certificate PEM for convenience (no private keys stored)
ALTER TABLE certs ADD COLUMN cert_pem TEXT;
