# Certy

Easy to use Web Based CA with SMIME and ACME support.

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


For a host myhost.local, make sure the app can reach:

http://myhost.local/.well-known/acme-challenge/<token>


(acme.sh will place this file when solving HTTP-01)

Point acme.sh at your directory:

export CA_DIR="http://localhost:3000/acme/directory"
acme.sh --register-account -m you@example.com --server "$CA_DIR"
acme.sh --issue -d myhost.local --server "$CA_DIR" --alpn 0 --standalone
# or use --webroot /var/www/html if you’ve got a webroot

After finalize, acme.sh will GET the cert from /acme/cert/<orderId> (the URL returned), which serves the leaf + intermediate chain in PEM.
