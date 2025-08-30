# Certy

Easy to use Web Based CA with SMIME and ACME support.  This is primarily for homelab use.  This project is really for me to learn about running a CA and the ends and outs.  That said, tt is in use with a few mid-size businesses.  

The code, however, has not been audited and there may be some security issues.

## Storage and backups

All CA data is stored in a single SQLite database at `.local-ca/ca.db` by default (configurable via `LOCAL_CA_DB`).

What lives in SQLite:

- CA metadata and issued cert index
- ACME accounts, orders, authzs
- Root and Intermediate certificates and private keys (PEM), in table `keystore`

Backup strategy:

- Stop the app or ensure no writes, then back up the `ca.db` file
- Or copy hot with WAL mode: include both `ca.db` and `ca.db-wal`/`ca.db-shm` if present

Optional at-rest encryption for private keys:

- Set `KEYSTORE_SECRET` (>= 8 chars). Private keys stored in `keystore` will be encrypted using AES-256-GCM.
- Without `KEYSTORE_SECRET`, PEMs are stored as plaintext in the database.

One-time migration:

- On first run, any legacy PEM files found under `.local-ca/certs` and `.local-ca/private` will be imported into SQLite automatically.


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