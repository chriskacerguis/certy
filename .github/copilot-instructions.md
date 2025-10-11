# Certy - Certificate Authority CLI Tool

## Project Overview
`certy` is a Go-based CLI tool for simplified certificate authority (CA) operations and certificate generation. The tool manages a root CA with intermediate CA and generates certificates for various use cases (TLS, client auth, S/MIME).

## Core Architecture

### Certificate Hierarchy
- **Root CA**: Created via `-install`, stored locally for signing intermediate CA
- **Intermediate CA**: Signed by root CA, used for day-to-day certificate issuance
- Both CAs should be created and stored during `-install` operation

### Certificate Types
1. **TLS Server Certificates**: Default mode when passed domain names/IPs
2. **S/MIME Certificates**: Auto-detected when input is an email address
3. **Client Auth Certificates**: Enabled via `-client` flag
4. **CSR-based Certificates**: Generated from existing CSR via `-csr` flag

## Command-Line Interface

### Output File Naming Convention
Certificates should follow this pattern based on first domain/identifier plus count:
- Input: `example.com "*.example.com" example.test localhost 127.0.0.1 ::1`
- Output: `./example.com+5.pem` (cert) and `./example.com+5-key.pem` (key)
- The "+5" indicates 6 total identifiers (first domain + 5 additional)

### Supported Flags
- `-install`: Initialize CA infrastructure (root + intermediate)
- `-cert-file FILE`, `-key-file FILE`, `-p12-file FILE`: Custom output paths
- `-client`: Generate client authentication certificate
- `-ecdsa`: Use ECDSA instead of RSA for key generation
- `-pkcs12`: Generate .p12/.pfx file for legacy applications
- `-csr CSR`: Generate from CSR (conflicts with other flags except `-install` and `-cert-file`)

### Input Detection Logic
Implement smart detection:
- **Email pattern** (contains `@`): Generate S/MIME certificate
- **IP addresses**: Add as IP SANs (both IPv4 and IPv6 like `127.0.0.1`, `::1`)
- **Domain names**: Add as DNS SANs (including wildcards like `*.example.com`)

## Development Standards

### Key Dependencies
Use Go's `crypto/x509`, `crypto/rsa`, `crypto/ecdsa`, `crypto/x509/pkix` for certificate operations. Consider `software.sslmate.com/src/go-pkcs12` for PKCS#12 support. For YAML config parsing, use `gopkg.in/yaml.v3`.

### Storage & Persistence
- CA files should be stored in a standard location (e.g., `~/.certy/` or system-specific config dir)
- Use Go's `os.UserConfigDir()` or `os.UserHomeDir()` for cross-platform compatibility
- Store: `rootCA.pem`, `rootCA-key.pem`, `intermediateCA.pem`, `intermediateCA-key.pem`, `serial.txt`
- **No password protection** for CA private keys (simplicity over security for this tool)
- **Serial numbers**: Use sequential numbering stored in `serial.txt`, increment on each certificate issuance

### Configuration File
- Support optional YAML config file at `~/.certy/config.yml` (or alongside CA files)
- Keep it minimal - allow overriding defaults like validity periods, key sizes, algorithms
- Example: `default_validity_days: 365`, `default_key_type: rsa`, `default_key_size: 2048`
- Config values should be overridable by CLI flags

### Certificate Validity Periods
Define sensible defaults (configurable via YAML):
- Root CA: 10 years (3650 days)
- Intermediate CA: 5 years (1825 days)
- End-entity certificates: 1 year (365 days)

### Build & Distribution
- Single binary distribution using `go build`
- Consider embedding version info with build flags: `-ldflags "-X main.version=..."`
- Target: cross-platform (Linux, macOS, Windows)

### Error Handling
- Gracefully handle missing CA (prompt to run `-install` first)
- Validate CSR format before processing
- Check for flag conflicts (e.g., `-csr` with `-ecdsa`)
- Fail fast with clear error messages

## Testing Approach
- Test certificate generation for each type (TLS, client, S/MIME)
- Verify certificate chain validation (root → intermediate → end-entity)
- Test both RSA and ECDSA key generation
- Validate SAN parsing for mixed domains/IPs
- Test PKCS#12 file generation and password protection

## Reference
See `PROMPT.md` for the original specification and example usage patterns.
