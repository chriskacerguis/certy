# Certy - Simple Certificate Authority CLI

[![CI](https://github.com/chriskacerguis/certy/workflows/CI/badge.svg)](https://github.com/chriskacerguis/certy/actions)
[![Release](https://github.com/chriskacerguis/certy/workflows/Build%20and%20Release/badge.svg)](https://github.com/chriskacerguis/certy/releases)

A lightweight, user-friendly command-line tool for managing your own Certificate Authority and generating certificates for development and testing.  It is designed to be a drop in replacement for `mkcert`.

## Features

- **Simple CA Management**: Create and manage a root CA with intermediate CA in one command
- **Multiple Certificate Types**: TLS server, client authentication, and S/MIME certificates
- **Smart Input Detection**: Automatically detects domains, IPs, and email addresses
- **ECDSA Support**: Generate certificates with ECDSA keys for modern crypto
- **PKCS#12 Export**: Create `.p12`/`.pfx` files for legacy application compatibility
- **CSR Support**: Generate certificates from existing Certificate Signing Requests
- **No Dependencies**: Single binary with no external runtime dependencies

## Installation

### Pre-built Binaries

Download the latest release for your platform from the [releases page](https://github.com/chriskacerguis/certy/releases).

**Linux (AMD64):**
```bash
wget https://github.com/chriskacerguis/certy/releases/latest/download/certy-linux-amd64
chmod +x certy-linux-amd64
sudo mv certy-linux-amd64 /usr/local/bin/certy
```

**macOS (Apple Silicon):**
```bash
wget https://github.com/chriskacerguis/certy/releases/latest/download/certy-darwin-arm64
chmod +x certy-darwin-arm64
sudo mv certy-darwin-arm64 /usr/local/bin/certy
```

**macOS (Intel):**
```bash
wget https://github.com/chriskacerguis/certy/releases/latest/download/certy-darwin-amd64
chmod +x certy-darwin-amd64
sudo mv certy-darwin-amd64 /usr/local/bin/certy
```

**Windows:**
Download `certy-windows-amd64.exe` from the releases page and add it to your PATH.

### From Source

```bash
git clone https://github.com/chriskacerguis/certy.git
cd certy
go build -ldflags "-X main.version=1.0.1" -o certy
sudo mv certy /usr/local/bin/
```

### Quick Start

```bash
# Initialize the CA infrastructure (one-time setup)
certy -install

# Generate a TLS certificate for multiple domains/IPs
certy example.com "*.example.com" example.test localhost 127.0.0.1 ::1

# Generate an S/MIME certificate
certy user@example.com

# Generate a client authentication certificate
certy -client client.example.com
```

## Usage

### Initialize CA Infrastructure

Before generating any certificates, you must initialize the CA:

```bash
certy -install
```

This creates:
- Root CA (valid for 10 years)
- Intermediate CA (valid for 5 years)
- Configuration file at `~/.certy/config.yml`
- Serial number tracker

All CA files are stored in `~/.certy/` by default.

### Custom CA Directory

You can specify a custom directory for CA files using the `-ca-dir` flag:

```bash
# Install CA in a custom directory
certy -ca-dir /path/to/ca -install

# Use custom CA directory for certificate generation
certy -ca-dir /path/to/ca example.com
```

This is useful for:
- Managing multiple CAs (e.g., dev, staging, production)
- Storing CA files in a specific location (e.g., encrypted volume)
- Team shared CA directories

### Generate TLS Server Certificates

```bash
# Single domain
certy example.com

# Multiple domains and IPs
certy example.com "*.example.com" 127.0.0.1 ::1

# With custom output paths
certy -cert-file ./certs/server.pem -key-file ./certs/server-key.pem example.com
```

Output files follow the pattern: `<first-domain>+<count>.pem` and `<first-domain>+<count>-key.pem`

### Generate S/MIME Certificates

Automatically detected when input contains an email address:

```bash
certy user@example.com
```

### Generate Client Authentication Certificates

```bash
certy -client client.example.com
```

### Use ECDSA Instead of RSA

```bash
certy -ecdsa example.com
```

### Generate PKCS#12 Files

For applications that require `.p12` or `.pfx` format:

```bash
certy -pkcs12 example.com

# Custom PKCS#12 path
certy -pkcs12 -p12-file ./cert.p12 example.com
```

**Note**: PKCS#12 files are generated with an empty password for simplicity.

### Generate from CSR

```bash
certy -csr request.csr -cert-file signed.pem
```

## Configuration

Configuration is stored at `~/.certy/config.yml`:

```yaml
default_validity_days: 365          # Certificate validity (1 year)
root_ca_validity_days: 3650         # Root CA validity (10 years)
intermediate_ca_validity_days: 1825 # Intermediate CA validity (5 years)
default_key_type: rsa               # Key algorithm (rsa or ecdsa)
default_key_size: 2048              # RSA key size
```

You can edit this file to customize defaults. CLI flags always override config values.

## Examples

### Local Development Server

```bash
certy localhost 127.0.0.1 ::1
# Outputs: localhost+2.pem and localhost+2-key.pem
```

### Wildcard Certificate

```bash
certy "*.dev.example.com" dev.example.com
```

### Multi-Domain Certificate

```bash
certy app.example.com api.example.com cdn.example.com
```

### Email Certificate with PKCS#12

```bash
certy -pkcs12 user@example.com
# Outputs: user-at-example.com.pem, user-at-example.com-key.pem, user-at-example.com.p12
```

### ECDSA Certificate

```bash
certy -ecdsa -pkcs12 modern.example.com
```

### Multiple CA Directories

```bash
# Create separate CAs for different environments
certy -ca-dir ./ca-dev -install
certy -ca-dir ./ca-staging -install
certy -ca-dir ./ca-prod -install

# Generate certificates for each environment
certy -ca-dir ./ca-dev dev.example.com
certy -ca-dir ./ca-staging staging.example.com
certy -ca-dir ./ca-prod example.com
```

## Certificate Chain

All certificates are signed by the intermediate CA, which is signed by the root CA:

```
Root CA (self-signed, 10 years)
  └── Intermediate CA (signed by root, 5 years)
      └── End-entity certificates (signed by intermediate, 1 year)
```

This follows best practices by keeping the root CA offline and using the intermediate CA for day-to-day operations.

## Trusting the Root CA

To trust certificates generated by certy, you need to add the root CA to your system's trust store:

### macOS

```bash
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain ~/.certy/rootCA.pem
```

### Linux (Debian/Ubuntu)

```bash
sudo cp ~/.certy/rootCA.pem /usr/local/share/ca-certificates/certy-root-ca.crt
sudo update-ca-certificates
```

### Windows

```powershell
certutil -addstore -f "ROOT" %USERPROFILE%\.certy\rootCA.pem
```

## Security Considerations

⚠️ **Important**: This tool is designed for **development and testing purposes**. It intentionally prioritizes simplicity over security:

- CA private keys are **not password protected**
- PKCS#12 files use **empty passwords**
- All private keys are stored in plain text at `~/.certy/`

**Do not use this for production certificates or security-critical applications.**

## File Naming

Generated files use sanitized filenames based on the first input:

- `@` → `-at-`
- `*` → `wildcard`
- `:` → `-`
- `/` → `-`

Examples:
- `user@example.com` → `user-at-example.com.pem`
- `*.example.com` → `wildcard.example.com.pem`

## Troubleshooting

### "CA not found" Error

Run `certy -install` to initialize the CA infrastructure.

### Invalid CSR Signature

Ensure your CSR file is valid:

```bash
openssl req -in request.csr -noout -verify
```

### Certificate Chain Issues

Verify the certificate chain:

```bash
openssl verify -CAfile ~/.certy/rootCA.pem -untrusted ~/.certy/intermediateCA.pem certificate.pem
```

## License

MIT License - see LICENSE file for details.

## Contributing

Contributions welcome! Please open an issue or pull request on GitHub.

## Credits

Built with Go using standard library crypto packages and:
- [go-pkcs12](https://github.com/SSLMate/go-pkcs12) for PKCS#12 support
- [yaml.v3](https://github.com/go-yaml/yaml) for configuration parsing
