# Certy

Easy to use Web Based CA with SMIME and ACME support.  This is primarily for homelab use.  This project is really for me to learn about running a CA and the ends and outs.  That said, tt is in use with a few mid-size businesses.  

The code, however, has not been audited and there may be some security issues.

## Homelab Quick Start

If you are running this in a homelab and aren't worried too much about security, you can quick start by:

- Run `cp .env.example .env`
- Run `docker compose up -d`

### Docker backup and restore

By default inside the container, data lives at `/app/.local-ca` (SQLite `ca.db` plus WAL/SHM). Mount this to a named volume or host directory for persistence.

Recommended compose volume mapping (example):

```yaml
services:
	certy:
		build: .
		volumes:
			- certy_data:/app/.local-ca
volumes:
	certy_data:
```

Hot backup (container running) with Docker Compose:

```bash
# Adjust "app" to your compose service name
docker compose exec certy sh -c 'tar czf - -C /app/.local-ca .' > certy-backup-$(date +%F).tgz
```

Cold backup (less risk):

```bash
# Stop the app to quiesce writes
docker compose stop certy

# If using a named volume (e.g., certy_data)
docker run --rm -v certy_data:/data -v "$PWD":/backup alpine sh -c 'tar czf /backup/certy-backup-$(date +%F).tgz -C /data .'

# If using a bind mount to a host path (e.g., ./data/.local-ca)
tar czf certy-backup-$(date +%F).tgz -C ./data/.local-ca .

# Restart the app
docker compose start certy
```

Restore from a backup archive:

```bash
# Stop the app
docker compose stop certy

# Named volume restore (replace filename as needed)
docker run --rm -v certy_data:/data -v "$PWD":/backup alpine sh -c 'rm -rf /data/* && tar xzf /backup/certy-backup-YYYY-MM-DD.tgz -C /data'

# Bind mount restore to host path
rm -rf ./data/.local-ca/*
tar xzf certy-backup-YYYY-MM-DD.tgz -C ./data/.local-ca

# Start the app
docker compose start certy
```

Notes:

- Hot backups must include WAL/SHM; the tar commands above archive the entire directory safely.
- Prefer cold backups when possible to minimize risk of partial writes.
- If you customized `LOCAL_CA_DIR`/`LOCAL_CA_DB`, adjust paths accordingly.

## Rotate the keystore secret

Use this when you want to change `KEYSTORE_SECRET`. Rotation re-encrypts all private keys in the `keystore` table from the old secret (or plaintext) to the new secret.

Prerequisites:

- Make a backup of your SQLite DB file (see Storage and backups).
- Set a new, strong `KEYSTORE_SECRET` (>= 8 chars).
- If existing entries are currently encrypted, set `KEYSTORE_SECRET_OLD` to the previous secret so they can be decrypted.
- Ensure `ENABLE_CA_LIFECYCLE=true` so the admin action is visible.

Steps:

1. Restart the app so the new environment variables take effect.
2. Open the CA admin page in the UI (Admin → CA).
3. Click "Rotate Keystore Secret" and confirm. You’ll see a summary like "Rotated X/Y entries".
4. Remove `KEYSTORE_SECRET_OLD` from your environment and restart the app again.

Notes:

- Rotation updates only how keys are stored at rest; certificates themselves are unchanged.
- The operation is transactional; if a keystore item cannot be decrypted with the provided secrets, rotation aborts without partial updates.
- It’s safe to re-run; entries already encrypted with the new secret are skipped.

## How to use with acme.sh (example)

Enable in .env:

`ACME_ENABLE=true`

For a host `myhost.local`, make sure the app can reach:

http://myhost.local/.well-known/acme-challenge/<token>

(acme.sh will place this file when solving HTTP-01)

Point `acme.sh` at your directory:

```bash
export CA_DIR="http://localhost:3000/acme/directory"
acme.sh --register-account -m you@example.com --server "$CA_DIR"
acme.sh --issue -d myhost.local --server "$CA_DIR" --alpn 0 --standalone
# or use --webroot /var/www/html if you’ve got a webroot
```

After finalize, acme.sh will GET the cert from `/acme/cert/<orderId>` (the URL returned), which serves the leaf + intermediate chain in PEM.

## Configuration (environment variables)

Set these in your shell or a `.env` file. Defaults are shown where applicable.

- Core/server
	- PORT: Port to listen on. Default 3000.
	- NODE_ENV: Node environment. Affects logging and cookie security. Default development.
	- TRUST_PROXY: Set true when behind a reverse proxy/load balancer to enable secure cookies. Default false.
	- SESSION_SECRET: Secret for session cookies. Default change_me (set a strong value in production).
	- RATE_LIMIT_MAX: Requests per minute per IP. Default 120.
	- AUTH_OPTIONAL: When true, bypasses auth if OIDC is not configured (useful for dev/tests). Default false.

- Logging
	- LOG_LEVEL: pino log level. Default debug in development, info in production.
	- LOG_PRETTY: Pretty-print logs for local dev. Default false.
	- HTTP_LOG_SAMPLE_RATE: Sample rate for successful HTTP logs (1-in-N). Default 10.
	- HTTP_LOG_IGNORE_PATHS: Comma-separated paths to skip logging. Default /healthz,/favicon.ico,/public

- SQLite storage and migrations
	- LOCAL_CA_DIR: Base dir for local CA data. Default ./.local-ca
	- LOCAL_CA_DB: SQLite DB path. Default <LOCAL_CA_DIR>/ca.db
	- MIGRATIONS_DIR: Directory containing DB migrations. Default ./src/migrations
	- KEYSTORE_SECRET: Optional passphrase (>= 8 chars). When set, private keys stored in DB are encrypted with AES-256-GCM.

- CA settings
	- ENABLE_CA_LIFECYCLE: Enable init/destroy CA actions from UI. Default false.
	- CA_ROOT_DAYS: Root cert validity in days. Default 3650.
	- CA_INT_DAYS: Intermediate cert validity in days. Default 1825.
	- CA_LEAF_DAYS: Default leaf cert validity in days. Default 90.
	- CA_ROOT_KEY_BITS: Root RSA key size. Default 4096.
	- CA_INT_KEY_BITS: Intermediate RSA key size. Default 3072.
	- S3_CRL_PUBLIC_URL: If set, included in generated intermediate and leaf certificates as a CRL Distribution Point (cRLDistributionPoints).

- ACME
	- ACME_ENABLE: Enable ACME endpoints. Default false.
	- ACME_HTTP_VERIFY_TIMEOUT_MS: HTTP-01 fetch timeout (ms). Default 5000.

- CRL publishing to S3/compatible storage
	- S3_CRL_ENABLE: Enable CRL publishing. Default false.
	- S3_CRL_BUCKET: Target bucket name. Required when enabled.
	- S3_CRL_KEY: Object key for the CRL. Default crl/intermediate.crl.pem
	- S3_CRL_REGION: AWS region. Default us-east-1.
	- S3_CRL_ENDPOINT: Optional custom endpoint (e.g., http://localhost:9000 for MinIO).
	- S3_CRL_PUBLIC_URL: Optional public URL override for the CRL (used in UI and embedded in certs via cRLDistributionPoints).
	- S3_CRL_ACL: Object ACL. Default public-read (ensure your bucket policy allows this or remove ACL).
	- S3_CRL_CACHE_CONTROL: Cache-Control header for CRL objects. Default public, max-age=300
	- S3_CRL_FORCE_PATH_STYLE: true for path-style addressing (needed for some S3-compatible stores). Default false.

- SMTP (for optional S/MIME p12 email delivery)
	- SMTP_HOST: SMTP server hostname. If not set, email option is hidden/disabled in UI.
	- SMTP_PORT: SMTP port. Default 587.
	- SMTP_SECURE: Use TLS (smtps). Default false.
	- SMTP_USER: Optional username.
	- SMTP_PASS: Optional password.
	- SMTP_FROM: From address used for emails. Default no-reply@example.com

- OIDC authentication (optional; when not configured and AUTH_OPTIONAL=true, routes work without login)
	- OIDC_ISSUER: Issuer URL, e.g., https://your-idp/. Required to enable OIDC.
	- OIDC_CLIENT_ID: OIDC client ID.
	- OIDC_CLIENT_SECRET: OIDC client secret.
	- OIDC_REDIRECT_URI: Redirect URI (must match app registration), e.g., http://localhost:3000/auth/callback
	- OIDC_SCOPES: Requested scopes. Default openid profile email

See `.env.example` for a starter configuration.