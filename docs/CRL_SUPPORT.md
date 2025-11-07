# Certificate Revocation List (CRL) Support

**Version**: 1.0.4+  
**Status**: ✅ Implemented and tested

## Overview

Certy now supports Certificate Revocation Lists (CRLs), a critical feature for production environments that need to invalidate compromised or outdated certificates. This implementation follows industry best practices and is fully compatible with OpenSSL and other PKI tools.

## Features

### 1. CRL Distribution Points
- CRL URL can be configured in `config.yml`
- Embedded in intermediate CA certificate's X.509 extensions
- Automatically included in all issued certificates
- Standard URI format (e.g., `http://crl.example.com/intermediate.crl`)

### 2. Certificate Revocation
- Revoke certificates by serial number (decimal or hexadecimal format)
- Track revocation timestamp and reason code
- Persistent storage in `revoked.db`
- Prevents duplicate revocations

### 3. CRL Generation
- Creates properly formatted X.509 v2 CRL files
- Signed by intermediate CA
- 30-day validity period
- Includes all revoked certificates with timestamps
- DER-encoded, PEM-wrapped output

## Architecture

### File Structure
```
~/.certy/
├── rootCA.pem              # Root CA certificate
├── rootCA-key.pem          # Root CA private key
├── intermediateCA.pem      # Intermediate CA certificate (includes CRL DP)
├── intermediateCA-key.pem  # Intermediate CA private key
├── config.yml              # Configuration (includes crl_url)
├── serial.txt              # Serial number tracker
├── revoked.db              # Revoked certificates database
└── crl.pem                 # Certificate Revocation List (default location)
```

### Revoked Certificates Database Format
File: `revoked.db`  
Format: Simple text, one entry per line  
Schema: `<serial>,<unix_timestamp>,<reason_code>`

Example:
```
1,1762524830,0
42,1762525100,1
255,1762525200,5
```

### CRL File Format
- **Type**: X.509 Certificate Revocation List v2
- **Encoding**: DER (binary), wrapped in PEM
- **Signature**: SHA-256 with RSA (or ECDSA if intermediate CA uses ECDSA)
- **Validity**: 30 days from generation
- **Extensions**: Authority Key Identifier, CRL Number

## Configuration

### Enable CRL Support

Edit `~/.certy/config.yml` to add a CRL distribution point URL:

```yaml
default_validity_days: 365
root_ca_validity_days: 3650
intermediate_ca_validity_days: 1825
default_key_type: rsa
default_key_size: 2048
crl_url: http://crl.example.com/intermediate.crl  # Add this line
```

### Reinstall Intermediate CA

After adding the CRL URL to config, you must reinstall the CA to embed the CRL distribution point in the intermediate CA certificate:

```bash
certy -install
```

**Important**: This regenerates the intermediate CA certificate with the CRL distribution point extension. All previously issued certificates will remain valid but won't include the CRL URL.

## Usage

### 1. Revoke a Certificate

```bash
# Find the certificate's serial number
openssl x509 -in certificate.pem -noout -serial
# Output: serial=01

# Revoke the certificate (decimal format)
certy -revoke 1

# Or use hex format from openssl
certy -revoke 0x01
```

**Revocation Reason Codes** (optional, defaults to 0):
- `0` - Unspecified (default)
- `1` - Key compromise
- `2` - CA compromise
- `3` - Affiliation changed
- `4` - Superseded
- `5` - Cessation of operation

### 2. Generate CRL File

```bash
# Generate CRL in default location (~/.certy/crl.pem)
certy -gencrl

# Specify custom output path
certy -gencrl /var/www/crl/intermediate.crl

# Use custom CA directory
certy -ca-dir /path/to/ca -gencrl /path/to/ca/crl.pem
```

The CRL should be regenerated:
- After revoking any certificates
- Periodically (before 30-day expiration)
- Automatically via cron job or CI/CD pipeline

### 3. Verify Certificate Against CRL

```bash
# Full chain verification with CRL checking
openssl verify \
  -CAfile ~/.certy/rootCA.pem \
  -untrusted ~/.certy/intermediateCA.pem \
  -crl_check \
  -CRLfile ~/.certy/crl.pem \
  certificate.pem
```

**Expected output for valid certificate:**
```
certificate.pem: OK
```

**Expected output for revoked certificate:**
```
CN=example.com
error 23 at 0 depth lookup: certificate revoked
error certificate.pem: verification failed
```

### 4. Inspect CRL Contents

```bash
# View CRL in human-readable format
openssl crl -in ~/.certy/crl.pem -text -noout

# Extract revoked certificate serial numbers
openssl crl -in ~/.certy/crl.pem -text -noout | grep "Serial Number:"
```

## Complete Workflow Example

### Scenario: Development CA with CRL Support

```bash
# Step 1: Configure CRL URL
cat >> ~/.certy/config.yml << EOF
crl_url: http://crl.dev.example.com/intermediate.crl
EOF

# Step 2: Install/Reinstall CA with CRL distribution point
certy -install

# Step 3: Generate certificates (now include CRL URL)
certy api.dev.example.com
certy web.dev.example.com
certy admin.dev.example.com

# Step 4: Verify CRL distribution point in certificate
openssl x509 -in api.dev.example.com.pem -text -noout | grep -A 2 "CRL Distribution"
# Output:
#   X509v3 CRL Distribution Points:
#       Full Name:
#         URI:http://crl.dev.example.com/intermediate.crl

# Step 5: Compromise detected - revoke certificate
openssl x509 -in admin.dev.example.com.pem -noout -serial
# Output: serial=03
certy -revoke 3

# Step 6: Generate updated CRL
certy -gencrl /var/www/crl/intermediate.crl

# Step 7: Publish CRL (make it accessible at the configured URL)
# Example with nginx:
# sudo cp /var/www/crl/intermediate.crl /var/www/crl.dev.example.com/intermediate.crl

# Step 8: Verify revocation is working
openssl verify \
  -CAfile ~/.certy/rootCA.pem \
  -untrusted ~/.certy/intermediateCA.pem \
  -crl_check \
  -CRLfile /var/www/crl/intermediate.crl \
  admin.dev.example.com.pem
# Output: error 23 at 0 depth lookup: certificate revoked

# Step 9: Verify non-revoked certificates still work
openssl verify \
  -CAfile ~/.certy/rootCA.pem \
  -untrusted ~/.certy/intermediateCA.pem \
  -crl_check \
  -CRLfile /var/www/crl/intermediate.crl \
  api.dev.example.com.pem
# Output: api.dev.example.com.pem: OK
```

## Production Deployment

### CRL Publishing Strategy

1. **Static Web Server** (Recommended):
   ```bash
   # nginx configuration
   server {
       listen 80;
       server_name crl.example.com;
       
       location /intermediate.crl {
           alias /var/www/crl/intermediate.crl;
           add_header Content-Type application/pkix-crl;
           add_header Cache-Control "max-age=86400"; # 24 hours
       }
   }
   ```

2. **CDN Distribution**:
   - Upload CRL to S3/CloudFront for global distribution
   - Update CRL URL in config to CDN endpoint
   - Set appropriate cache headers (24 hours recommended)

3. **Automated Regeneration**:
   ```bash
   # Cron job example (regenerate daily)
   0 0 * * * cd /path/to/ca && certy -gencrl /var/www/crl/intermediate.crl
   ```

### CRL Monitoring

Monitor these metrics in production:
- CRL file age (regenerate before 30-day expiration)
- CRL file availability (HTTP 200 from distribution URL)
- CRL size (increases with revocations)
- Revocation count trends

### Security Considerations

✅ **Safe**:
- CRL files are digitally signed by intermediate CA
- Revoked.db is append-only (no deletion)
- Serial numbers are validated before revocation
- Duplicate revocations are prevented

⚠️ **Important**:
- Intermediate CA private key must be protected (required for CRL signing)
- CRL URL must be accessible to all certificate validators
- CRL should be regenerated regularly (automated cron job)
- Old CRLs expire after 30 days

## Testing

### Test Coverage
File: `crl_test.go` - 8 comprehensive tests

✅ **Validated Scenarios**:
- Empty CRL generation (no revoked certificates)
- Certificate revocation (single and multiple)
- CRL regeneration with revoked certificates
- Duplicate revocation prevention
- CRL distribution point in intermediate CA
- Empty/nonexistent revoked.db handling
- Serial number parsing (decimal and hex)
- Revoked certificate parsing from database

### Manual Testing

```bash
# Test CRL generation workflow
tmpdir=$(mktemp -d)
certy -ca-dir "$tmpdir" -install
echo "crl_url: http://test.example.com/crl.pem" >> "$tmpdir/config.yml"
certy -ca-dir "$tmpdir" -install
certy -ca-dir "$tmpdir" test.example.com
openssl x509 -in test.example.com.pem -noout -serial
certy -ca-dir "$tmpdir" -revoke 1
certy -ca-dir "$tmpdir" -gencrl "$tmpdir/crl.pem"
openssl crl -in "$tmpdir/crl.pem" -text -noout
openssl verify -CAfile "$tmpdir/rootCA.pem" \
  -untrusted "$tmpdir/intermediateCA.pem" \
  -crl_check \
  -CRLfile "$tmpdir/crl.pem" \
  test.example.com.pem
# Expected: certificate revoked error
rm -rf "$tmpdir"
```

## Limitations

1. **CRL Size**: CRLs grow with revocations. For high-volume environments, consider:
   - Delta CRLs (not currently supported)
   - OCSP (Online Certificate Status Protocol) - not implemented
   - Shorter certificate lifetimes to reduce revocation needs

2. **Distribution**: CRL URL must be accessible when certificates are validated:
   - Client must have network access to CRL server
   - CRL server downtime prevents certificate validation
   - Consider caching strategies for offline scenarios

3. **Revocation Database**: Simple text format has performance limitations:
   - Linear search for duplicate checking
   - No built-in backup/recovery
   - For production, consider periodic backups of `revoked.db`

## Troubleshooting

### CRL Distribution Point Not Appearing in Certificates

**Problem**: Certificates don't include CRL distribution point extension.

**Solution**:
1. Verify `crl_url` is set in `config.yml`
2. Run `certy -install` to regenerate intermediate CA
3. Generate new certificates (existing ones won't be updated)

### Certificate Revocation Not Working

**Problem**: `openssl verify -crl_check` doesn't detect revocation.

**Checklist**:
- [ ] Certificate was revoked: Check `~/.certy/revoked.db`
- [ ] CRL was regenerated after revocation: `certy -gencrl`
- [ ] CRL file is readable: `openssl crl -in crl.pem -text -noout`
- [ ] Correct CRL file path in verify command
- [ ] Serial number matches: Compare `openssl x509 -serial` output with `revoked.db`

### "Invalid Serial Number" Error

**Problem**: `certy -revoke` fails with invalid serial number.

**Solution**: Serial numbers can be in decimal or hexadecimal:
```bash
# Decimal (without 0x prefix)
certy -revoke 123

# Hexadecimal (with 0x prefix)
certy -revoke 0x7B
```

## References

- [RFC 5280 - X.509 Certificate and CRL Profile](https://tools.ietf.org/html/rfc5280)
- [OpenSSL CRL Verification](https://www.openssl.org/docs/man1.1.1/man1/verify.html)
- [X.509 Revocation Reason Codes](https://tools.ietf.org/html/rfc5280#section-5.3.1)

## Future Enhancements

Potential improvements for future versions:
- [ ] OCSP (Online Certificate Status Protocol) support
- [ ] Delta CRLs for large revocation lists
- [ ] Automated CRL publishing to HTTP server
- [ ] SQLite database backend for revoked certificates
- [ ] CRL expiration warnings
- [ ] Batch revocation from CSV file
- [ ] Revocation reason code selection via flag
- [ ] CRL validation and signing date verification
