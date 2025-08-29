# Certy

Easy to use Web Based CA with SMIME and ACME support.


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
