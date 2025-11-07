# Certy - Certificate Authority CLI Tool

## Project Overview
`certy` is a Go-based CLI tool for simplified certificate authority (CA) operations and certificate generation. The tool manages a root CA with intermediate CA and generates certificates for various use cases (TLS, client auth, S/MIME).

**Current Status**: Fully implemented and functional (v1.0.1+)

## Project Structure

```
certy/
├── main.go       # CLI interface, flag parsing, command routing
├── config.go     # Configuration management, storage paths, serial numbers
├── ca.go         # CA generation (root + intermediate), key/cert persistence
├── cert.go       # Certificate generation, SAN parsing, CSR handling
├── pkcs12.go     # PKCS12 export functionality
├── crl.go        # CRL generation and certificate revocation (v1.0.4+)
├── go.mod        # Dependencies: gopkg.in/yaml.v3, go-pkcs12
├── Taskfile.yml  # Task runner (go-task) for development workflows
└── .github/
    ├── copilot-instructions.md
    └── workflows/
        ├── build.yml  # Multi-platform release builds (triggered on tags)
        └── ci.yml     # Continuous integration tests (uses go-task)
```

## Core Architecture

### Certificate Hierarchy
- **Root CA**: Self-signed, 10-year validity, created via `-install`
- **Intermediate CA**: Signed by root CA, 5-year validity, used for all certificate issuance
- **End-entity Certificates**: Signed by intermediate CA, 1-year validity
- Certificate chain: Root CA → Intermediate CA → End-entity cert

### Certificate Types
1. **TLS Server Certificates**: Default mode for domain names/IPs
   - Key usage: Digital Signature, Key Encipherment
   - Extended key usage: Server Authentication
2. **S/MIME Certificates**: Auto-detected when input contains `@`
   - Key usage: Digital Signature, Key Encipherment
   - Extended key usage: Email Protection
3. **Client Auth Certificates**: Enabled via `-client` flag
   - Key usage: Digital Signature
   - Extended key usage: Client Authentication
4. **CSR-based Certificates**: Generated from existing CSR via `-csr` flag

## Command-Line Interface

### Output File Naming Convention
Certificates follow this pattern based on first domain/identifier plus count:
- Input: `example.com "*.example.com" example.test localhost 127.0.0.1 ::1`
- Output: `./example.com+5.pem` (cert) and `./example.com+5-key.pem` (key)
- The "+5" indicates 6 total identifiers (first domain + 5 additional)
- Special characters sanitized: `@` → `-at-`, `*` → `wildcard`, `:` → `-`

### Supported Flags
- `-install`: Initialize CA infrastructure (root + intermediate)
- `-ca-dir DIR`: Custom directory for CA files (overrides `$CAROOT`, default: `~/.certy/`)
- `-CAROOT`: Print the CA root directory path and exit
- `-cert-file FILE`, `-key-file FILE`, `-p12-file FILE`: Custom output paths
- `-client`: Generate client authentication certificate
- `-ecdsa`: Use ECDSA P-256 instead of RSA 2048-bit for key generation
- `-pkcs12`: Generate .p12/.pfx file (optional password protection, v1.0.3+)
- `-p12-password PASSWORD`: Set password for PKCS#12 file (optional, v1.0.3+)
- `-csr CSR`: Generate from CSR (conflicts with all flags except `-install`, `-ca-dir`, and `-cert-file`)
- `-gencrl FILE`: Generate Certificate Revocation List (CRL) to specified file (v1.0.4+)
- `-revoke SERIAL`: Revoke certificate by serial number (decimal or hex) (v1.0.4+)

### Input Detection Logic
Smart auto-detection implemented in `cert.go`:
- **Email pattern** (contains `@`): Generate S/MIME certificate
- **IP addresses**: Parse and add as IP SANs (IPv4 and IPv6)
- **Domain names**: Add as DNS SANs (including wildcards like `*.example.com`)
- See `parseInputs()` function in `cert.go`

## Development Standards

### Key Dependencies
- Go standard library: `crypto/x509`, `crypto/rsa`, `crypto/ecdsa`, `crypto/x509/pkix`
- `software.sslmate.com/src/go-pkcs12` v0.4.0 for PKCS12 support
- `gopkg.in/yaml.v3` for configuration parsing

### Storage & Persistence
- **Directory priority** (checked in this order):
  1. `-ca-dir` flag (highest priority)
  2. `$CAROOT` environment variable
  3. `~/.certy/` default location (lowest priority)
- **Custom directory**: Global `customCADir` variable set from flag, checked by `getCertyDir()`
- **Files stored**:
  - `rootCA.pem`, `rootCA-key.pem` (root CA cert and private key)
  - `intermediateCA.pem`, `intermediateCA-key.pem` (intermediate CA cert and private key)
  - `config.yml` (YAML configuration)
  - `serial.txt` (sequential serial number counter)
- **No password protection** for CA private keys (design decision for simplicity)
- **Serial numbers**: Sequential numbering in `serial.txt`, incremented via `getSerialNumber()` on each certificate issuance

### Configuration File
Location: `~/.certy/config.yml` (or within custom `-ca-dir`)

Default values (see `DefaultConfig()` in `config.go`):
```yaml
default_validity_days: 365          # End-entity certificate validity
root_ca_validity_days: 3650         # Root CA validity (10 years)
intermediate_ca_validity_days: 1825 # Intermediate CA validity (5 years)
default_key_type: rsa               # Key algorithm (rsa or ecdsa)
default_key_size: 2048              # RSA key size in bits
crl_url: ""                         # Optional: CRL distribution point URL (v1.0.4+)
```

**Configuration Validation** (v1.0.2+):
All config parameters are validated on load and save via `validateConfig()`:
- Validity periods: Enforces min/max bounds and hierarchy constraints
- Key types: Only `rsa` or `ecdsa` allowed
- Key sizes: RSA (2048/3072/4096), ECDSA (256/384/521)
- CRL URL: Optional field (v1.0.4+)
- See `docs/CONFIG_VALIDATION.md` for complete validation rules

### Certificate Validity Periods
Hardcoded defaults (configurable via YAML):
- Root CA: 3650 days (10 years)
- Intermediate CA: 1825 days (5 years)
- End-entity certificates: 365 days (1 year)

### Build & Distribution
- Single binary: `task build` or `go build -ldflags "-X main.version=1.0.1" -o certy`
- Version embedding: Uses `main.version` variable (auto-detected from git tags)
- Cross-platform: Linux, macOS, Windows (no platform-specific code)
- Binary size: ~5.7MB (includes all dependencies)
- Multi-platform builds: `task build:all` for Linux, macOS, Windows

### Development Workflow
**Task runner (go-task):**
- `task` - Show available commands
- `task test` - Run all tests
- `task test:coverage` - Tests with coverage report
- `task build` - Build binary
- `task lint` - Run linters
- `task check` - Run all quality checks
- `task ci` - Full CI pipeline
- See `Taskfile.yml` for all tasks

### CI/CD Workflows
**`build.yml`** - Automated release builds:
- Triggered on: Git tags (e.g., `v1.0.1`) or manual workflow dispatch
- Builds for: Linux (amd64, arm64, armv7), macOS (amd64, arm64), Windows (amd64, arm64)
- Outputs: Platform-specific binaries with SHA256 checksums
- Creates GitHub releases with installation instructions
- Build flags: `-ldflags "-s -w -X main.version=$VERSION"` (stripped binaries)

**`ci.yml`** - Continuous integration:
- Triggered on: Push to main, pull requests
- Uses go-task for all operations
- Tests: Build verification, certificate generation, chain validation
- Linting: golangci-lint with 5-minute timeout
- Matrix testing: Ubuntu, macOS, Windows with Go 1.23
- Custom CA directory testing included

### Error Handling Patterns
- Missing CA: Check `caExists()` before cert generation, prompt to run `-install`
- CSR validation: Parse and verify signature before issuing
- Flag conflicts: Validate in `main()` before processing
- Fail fast: Use `fatal()` helper for immediate exit with clear error messages

### Key Functions Reference

**`main.go`**:
- `main()`: CLI entry point, flag parsing, command routing
- `detectCertificateType()`: Determines cert type from inputs
- `fatal()`: Error helper with exit

**`config.go`**:
- `getCertyDir()`: Returns CA directory (custom or default)
- `loadConfig()`: Loads YAML config or returns defaults (with validation)
- `saveConfig()`: Saves config to YAML file (with validation)
- `validateConfig()`: Validates all config parameters (v1.0.2+)
- `getSerialNumber()`: Reads and increments serial number
- `caExists()`: Checks if CA files are present

**`ca.go`**:
- `installCA()`: Creates root + intermediate CA infrastructure
- `generateRootCA()`: Generates self-signed root CA
- `generateIntermediateCA()`: Generates intermediate CA signed by root
- `loadIntermediateCA()`: Loads intermediate CA for signing
- `saveKeyAndCert()`: Saves private key and certificate to PEM files

**`cert.go`**:
- `generateCertificate()`: Main certificate generation function
- `parseInputs()`: Parses domains, IPs, emails into SANs
- `determineCommonName()`: Determines CN based on cert type
- `determineOutputPaths()`: Generates output filenames
- `generateFromCSR()`: Issues certificate from CSR
- `saveCertificate()`, `savePrivateKey()`: PEM file writers

**`pkcs12.go`**:
- `generatePKCS12()`: Creates .p12 file from cert + key (optional password protection, v1.0.3+)

**`crl.go`** (v1.0.4+):
- `generateCRL()`: Creates CRL file from revoked certificates database
- `revokeCertificate()`: Adds certificate to revoked.db by serial number
- `loadRevokedCertificates()`: Loads revoked certificates from database
- `splitLines()`: Helper for parsing text files

## Testing Approach
**Test Coverage:** 61.2% code coverage with 108 comprehensive test cases

**Test Files:**
- `ca_test.go` - CA generation and certificate chain tests
- `cert_test.go` - Certificate generation and SAN parsing tests
- `config_test.go` - Configuration management and validation tests (23 subtests)
- `crl_test.go` - CRL generation and revocation tests (8 tests, v1.0.4+)
- `csr_test.go` - CSR-based certificate generation tests
- `integration_test.go` - End-to-end workflow tests
- `pkcs12_test.go` - PKCS12 export tests

Validated scenarios:
- ✅ CA installation in default and custom directories
- ✅ TLS certificates with multiple DNS names and IPs
- ✅ S/MIME certificates for email addresses
- ✅ Client authentication certificates
- ✅ ECDSA key generation (P-256 curve)
- ✅ PKCS12 export with certificate chain
- ✅ PKCS12 password protection (v1.0.3+)
- ✅ Certificate chain validation (root → intermediate → end-entity)
- ✅ Configuration validation (all parameter bounds and constraints)
- ✅ Sequential serial number tracking
- ✅ Filename sanitization for special characters
- ✅ CRL generation and certificate revocation (v1.0.4+)
- ✅ CRL distribution points in intermediate CA (v1.0.4+)

## Common Workflows

### Initialize New CA
```bash
certy -install                    # Default: ~/.certy/
certy -ca-dir ./custom-ca -install  # Custom directory
```

### Generate Certificates
```bash
certy example.com                                    # Single domain
certy example.com "*.example.com" 127.0.0.1 ::1     # Multi-domain with IPs
certy user@example.com                               # S/MIME (auto-detected)
certy -client client.example.com                     # Client auth
certy -ecdsa secure.example.com                      # ECDSA key
certy -pkcs12 app.example.com                        # With PKCS12 export
certy -ca-dir ./custom-ca example.com                # Use custom CA
```

### Verify Certificates
```bash
openssl x509 -in cert.pem -text -noout
openssl verify -CAfile ~/.certy/rootCA.pem -untrusted ~/.certy/intermediateCA.pem cert.pem
```

## Reference
- `PROMPT.md`: Original specification
- `README.md`: User-facing documentation with examples

## Security Considerations
⚠️ **This tool is for development/testing only**:
- CA private keys are stored unencrypted
- PKCS12 files use empty passwords
- Not suitable for production use
