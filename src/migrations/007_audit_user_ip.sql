PRAGMA foreign_keys = ON;

-- Extend audit_logs with explicit user and IP columns
ALTER TABLE audit_logs ADD COLUMN user_id TEXT;
ALTER TABLE audit_logs ADD COLUMN user_name TEXT;
ALTER TABLE audit_logs ADD COLUMN user_email TEXT;
ALTER TABLE audit_logs ADD COLUMN ip TEXT;

CREATE INDEX IF NOT EXISTS idx_audit_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_ip ON audit_logs(ip);
