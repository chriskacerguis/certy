# Security Policy

## Supported Versions

Currently, only the latest release of Certy receives security updates.

| Version | Supported          |
| ------- | ------------------ |
| Latest  | :white_check_mark: |
| < Latest| :x:                |

## Security Considerations

**⚠️ Important: Certy is designed for development and testing environments only.**

This tool intentionally prioritizes simplicity and ease of use over security:

- **No password protection** on CA private keys
- **Unencrypted storage** of all private keys in `~/.certy/` (or custom directory)
- **No access controls** on generated certificates
- **Empty passwords** on PKCS#12 exports

**Do not use Certy for:**
- Production certificate issuance
- Public-facing services
- Security-critical applications
- Compliance-required environments (PCI-DSS, HIPAA, etc.)

## Reporting a Vulnerability

If you discover a security vulnerability in Certy, please report it privately:

### How to Report

1. **Do NOT open a public GitHub issue** for security vulnerabilities
2. **Email**: Send details to the email address listed in the GitHub profile (@chriskacerguis)
3. **Include**:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

### What to Expect

- **Initial Response**: Within 7 days
- **Status Updates**: Every 14 days until resolved or closed
- **Disclosure Timeline**: Coordinated disclosure after a fix is available

### Response Process

1. **Acknowledgment**: I'll confirm receipt of your report
2. **Assessment**: I'll evaluate the severity and impact
3. **Fix Development**: If valid, I'll work on a patch
4. **Release**: A new version will be released with the fix
5. **Credit**: You'll be credited in the release notes (unless you prefer to remain anonymous)

## Known Limitations

The following are **known design decisions**, not security vulnerabilities:

- CA private keys stored without password protection
- PKCS#12 files generated with empty passwords
- No certificate revocation list (CRL) support
- No OCSP responder
- No audit logging
- Serial numbers are sequential (not cryptographically random)

These are intentional trade-offs for a simple development tool.

## Best Practices

If you use Certy, follow these security practices:

### Protect Your CA Files

```bash
# Restrict CA directory permissions
chmod 700 ~/.certy

# Restrict CA private key permissions
chmod 600 ~/.certy/*.pem
```

### Separate Environments

Use `-ca-dir` to maintain separate CAs for different environments:

```bash
certy -ca-dir ./ca-dev -install      # Development CA
certy -ca-dir ./ca-staging -install  # Staging CA
```

### Never Share CA Private Keys

- Don't commit CA files to version control
- Don't share `rootCA-key.pem` or `intermediateCA-key.pem`
- Add `*.pem` to your `.gitignore`

### Trusting the Root CA

Only add the Certy root CA to trust stores on **your development machines**. Never:
- Install in production environments
- Distribute to end users
- Add to organization-wide trust stores

### Regular Rotation

For long-term use, periodically regenerate your CA:

```bash
# Backup old CA
mv ~/.certy ~/.certy.backup

# Create fresh CA
certy -install
```

## Scope

Security issues in scope:
- Code execution vulnerabilities
- Certificate generation bugs that could produce invalid certificates
- Path traversal issues with `-ca-dir` or output paths
- Information disclosure beyond intended functionality

Out of scope:
- Requests to add password protection (by design)
- Requests for enterprise features (CRL, OCSP, HSM support)
- Issues related to misuse in production environments
- Social engineering attacks

## Attribution

Responsible disclosure is appreciated. Security researchers who report valid vulnerabilities will be credited in:
- Release notes
- This SECURITY.md file (Hall of Fame section, if we receive reports)

## Questions?

For security-related questions that aren't vulnerabilities, feel free to:
- Open a GitHub Discussion
- Open a regular GitHub Issue (for non-sensitive topics)

Thank you for helping keep Certy secure for development use! 🔒
