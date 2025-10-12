# Production Readiness Roadmap for Certy

## Current Status: Development/Testing Tool ⚠️

Certy is currently designed and marketed as a **development and testing tool only**. To make it production-ready, several critical security and operational features need to be implemented.

---

## Critical Security Issues (MUST FIX)

### 1. Private Key Encryption 🔴 **CRITICAL**

**Current State:**
- All CA and private keys stored **unencrypted** on disk
- File permissions are 0600 (better than nothing, but not enough)

**Required Changes:**
```go
// Add password/passphrase protection for CA keys
- Encrypt CA private keys using AES-256-GCM
- Prompt for passphrase during -install
- Prompt for passphrase when signing certificates
- Support password from environment variable or file for automation
```

**Implementation:**
- Add `crypto/aes`, `crypto/cipher` for encryption
- Use PBKDF2 or Argon2 for key derivation
- Store encrypted keys with salt and IV
- Add `-password-file` flag option

**Files to Modify:**
- `ca.go`: `saveKeyAndCert()`, `loadIntermediateCA()`
- `config.go`: Add password configuration options
- `main.go`: Add password prompting

---

### 2. PKCS#12 Password Protection 🔴 **CRITICAL**

**Current State:**
```go
# Production Readiness Roadmap for Certy

## Current Status: Development/Testing Tool ⚠️

Certy is currently designed and marketed as a **development and testing tool only**. To make it production-ready, several critical security and operational features need to be implemented.

---

## ✅ Completed Production Features

### Configuration Validation ✅

**Status:** Implemented in v1.0.2+

**What Was Added:**
- Comprehensive validation of all config.yml parameters
- Validates on both load and save operations
- Prevents invalid configurations from being created or persisted

**Validation Rules:**
```
Validity Periods:
  - default_validity_days: 1-825 days (max 2+ years)
  - root_ca_validity_days: 365-7300 days (1-20 years)
  - intermediate_ca_validity_days: 365-3650 days (1-10 years)
  - Hierarchy check: intermediate < root validity

Key Types:
  - Must be 'rsa' or 'ecdsa' (case-sensitive)

Key Sizes:
  - RSA: 2048, 3072, or 4096 bits only
  - ECDSA: 256 (P-256), 384 (P-384), or 521 (P-521) only
```

**Test Coverage:**
- 18 validation test cases in `TestValidateConfig`
- Tests for all boundary conditions and error cases
- Integration tests verify validation in load/save paths

**Files Modified:**
- `config.go`: Added `validateConfig()` function
- `config_test.go`: Added comprehensive validation tests

---

## Critical Security Issues (MUST FIX)

### 1. Private Key Encryption 🔴 **CRITICAL**

**Current State:**
- All CA and private keys stored **unencrypted** on disk
- File permissions are 0600 (better than nothing, but not enough)

**Required Changes:**
```go
// Add password/passphrase protection for CA keys
- Encrypt CA private keys using AES-256-GCM
- Prompt for passphrase during -install
- Prompt for passphrase when signing certificates
- Support password from environment variable or file for automation
```

**Implementation:**
- Add `crypto/aes`, `crypto/cipher` for encryption
- Use PBKDF2 or Argon2 for key derivation
- Store encrypted keys with salt and IV
- Add `-password-file` flag option

**Files to Modify:**
- `ca.go`: `saveKeyAndCert()`, `loadIntermediateCA()`
- `config.go`: Add password configuration options
- `main.go`: Add password prompting

---

### 2. PKCS#12 Password Protection 🔴 **CRITICAL**

**Current State:**
```go
// pkcs12.go line 86
pfxData, err := pkcs12.Modern.Encode(privateKey, cert, []*x509.Certificate{intCACert}, "")
//                                                                                      ^^
//                                                                           EMPTY PASSWORD!
```

**Required Changes:**
- **Never** allow empty passwords in production mode
- Add `-p12-password` flag
- Prompt for password if not provided
- Support password from stdin or environment variable

**Implementation:**
```go
func generatePKCS12(certPath, keyPath, p12Path, password string) error {
    if password == "" {
        return fmt.Errorf("PKCS#12 password required in production mode")
    }
````
//                                                                           EMPTY PASSWORD!
```

**Required Changes:**
- **Never** allow empty passwords in production mode
- Add `-p12-password` flag
- Prompt for password if not provided
- Support password from stdin or environment variable

**Implementation:**
```go
func generatePKCS12(certPath, keyPath, p12Path, password string) error {
    if password == "" {
        return fmt.Errorf("PKCS#12 password required in production mode")
    }
    // ... use password
}
```

---

### 3. Certificate Revocation List (CRL) 🔴 **CRITICAL**

**Current State:**
- **No CRL support** - compromised certificates cannot be revoked!
- No certificate tracking/database

**Required Changes:**
- Implement `certy revoke <serial>` command
- Generate and maintain CRL
- Add CRL distribution point to certificates
- Periodic CRL updates
- Optional: OCSP responder

**New Files Needed:**
- `crl.go` - CRL generation and management
- `database.go` - Certificate tracking

**Implementation:**
```go
// Track all issued certificates
type CertificateRecord struct {
    SerialNumber  *big.Int
    CommonName    string
    IssuedAt      time.Time
    ExpiresAt     time.Time
    Revoked       bool
    RevokedAt     time.Time
    RevokeReason  int
}

// Commands to add:
// certy revoke <serial>
// certy crl generate
// certy list
```

---

### 4. Key Storage Backend 🟡 **HIGH**

**Current State:**
- Everything stored in plain files
- No HSM or cloud KMS support

**Required Changes:**
- Abstract key storage layer
- Support multiple backends:
  - **HSM** (Hardware Security Module) via PKCS#11
  - **Cloud KMS** (AWS KMS, Google Cloud KMS, Azure Key Vault)
  - **Filesystem** (current, as fallback)

**New Files:**
- `internal/keystore/interface.go`
- `internal/keystore/filesystem.go`
- `internal/keystore/pkcs11.go`
- `internal/keystore/cloudkms.go`

**Configuration:**
```yaml
keystore:
  type: "hsm"  # or "filesystem", "aws-kms", "gcp-kms", "azure-kv"
  config:
    # HSM-specific config
    pkcs11_module: "/usr/lib/libsofthsm2.so"
    token_label: "certy-ca"
    pin: "${CERTY_HSM_PIN}"
```

---

### 5. Audit Logging 🟡 **HIGH**

**Current State:**
- **No audit trail** of certificate operations
- No logging of CA usage

**Required Changes:**
- Log **all** certificate issuances
- Log **all** CA operations (signing, revocation)
- Support structured logging (JSON)
- Support syslog integration
- Tamper-evident logs

**Implementation:**
```go
type AuditLog struct {
    Timestamp     time.Time
    Operation     string  // "issue", "revoke", "sign"
    SerialNumber  string
    Subject       string
    Requester     string
    IPAddress     string
    Result        string  // "success", "failure"
    Error         string
}

// Log to file, syslog, or remote service
func logAuditEvent(event AuditLog) error {
    // Write to append-only audit log
    // Optional: Sign audit entries
}
```

**New Files:**
- `audit.go`
- Configuration for log output

---

### 6. Certificate Validation & Policies 🟡 **MEDIUM**

**Current State:**
- Minimal validation of certificate requests
- No certificate policy enforcement
- No domain ownership validation

**Required Changes:**
- Certificate policy framework
- Name constraints for intermediate CA
- Domain ownership validation (ACME-style challenges)
- Rate limiting per domain/email
- Maximum certificate lifetime enforcement
- Key usage validation

**Implementation:**
```go
type CertificatePolicy struct {
    MaxValidityDays       int
    AllowedKeyTypes       []string
    MinKeySize            int
    RequireDomainValidation bool
    AllowedDomains        []string  // Name constraints
    RateLimits            map[string]int
}

func validateCertificateRequest(req *CertRequest, policy *CertificatePolicy) error {
    // Enforce policy
}
```

---

### 7. File Integrity & Permissions 🟡 **MEDIUM**

**Current State:**
- Basic file permissions (0600 for keys)
- No integrity checking
- No file locking

**Required Changes:**
- File integrity checksums/signatures
- File locking to prevent concurrent access
- Stricter directory permissions (0700 for CA dir)
- Detect tampering

**Implementation:**
```go
// Add checksums for CA files
type FileManifest struct {
    Files map[string]string  // filename -> SHA-256
}

// Verify integrity before use
func verifyCAIntegrity() error {
    // Check file hashes
    // Verify signatures
}
```

---

## Operational Improvements (SHOULD HAVE)

### 8. Certificate Database 🟢 **MEDIUM**

**Current State:**
- Only `serial.txt` tracking
- No certificate inventory

**Required Changes:**
- SQLite or PostgreSQL database
- Track all issued certificates
- Support queries: list, search, filter
- Certificate lifecycle management

**Schema:**
```sql
CREATE TABLE certificates (
    serial_number TEXT PRIMARY KEY,
    common_name TEXT,
    subject_alt_names TEXT,
    issued_at TIMESTAMP,
    expires_at TIMESTAMP,
    revoked BOOLEAN DEFAULT FALSE,
    revoked_at TIMESTAMP,
    revoke_reason INTEGER,
    cert_type TEXT,
    key_type TEXT,
    fingerprint TEXT
);
```

---

### 9. Configuration Management 🟢 **MEDIUM**

**Current State:**
- Simple YAML config
- Limited validation

**Required Changes:**
- Schema validation
- Configuration versioning
- Migration support
- Environment variable substitution
- Secrets management integration

**Example:**
```yaml
version: 2
ca:
  root:
    validity_days: 3650
    key_type: rsa
    key_size: 4096
  intermediate:
    validity_days: 1825
    name_constraints:
      permitted_dns: ["*.example.com"]
security:
  require_password: true
  audit_log: /var/log/certy/audit.log
  keystore:
    type: hsm
```

---

### 10. Certificate Transparency 🟢 **LOW**

**Current State:**
- No CT logging

**Required Changes:**
- Submit certificates to CT logs
- Include SCT in certificates
- Optional: Run own CT log

---

### 11. Monitoring & Alerts 🟢 **MEDIUM**

**Current State:**
- No monitoring
- No expiration alerts

**Required Changes:**
- Certificate expiration monitoring
- Alert before expiration (30, 7, 1 day warnings)
- Health check endpoint (if running as service)
- Metrics export (Prometheus format)

---

## Production Architecture Options

### Option A: Enhanced CLI Tool
- Add all security features above
- Keep as standalone CLI
- Use for internal/private PKI only
- **Use Cases:** Internal enterprise PKI, private services

### Option B: PKI Service
- Build API server around core
- RESTful API for certificate operations
- Authentication & authorization (OAuth2, mTLS)
- Multi-tenancy support
- **Use Cases:** Certificate-as-a-Service

### Option C: ACME Server
- Implement ACME protocol (RFC 8555)
- Compatible with certbot, acme.sh
- Automatic domain validation
- **Use Cases:** Automated certificate management

---

## Implementation Priority

### Phase 1: Security Foundations (Critical)
1. ✅ **Week 1-2:** Private key encryption
2. ✅ **Week 2:** PKCS#12 passwords
3. ✅ **Week 3:** Audit logging
4. ✅ **Week 4:** CRL support

### Phase 2: Storage & Management (High)
5. ✅ **Week 5-6:** Certificate database
6. ✅ **Week 7:** HSM/KMS support
7. ✅ **Week 8:** Certificate policies

### Phase 3: Operations (Medium)
8. ✅ **Week 9:** Configuration improvements
9. ✅ **Week 10:** Monitoring & alerts
10. ✅ **Week 11-12:** Testing & validation

### Phase 4: Optional Enhancements
11. Certificate Transparency
12. OCSP responder
13. API server mode
14. ACME protocol support

---

## Code Structure for Production

```
certy/
├── cmd/
│   └── certy/
│       └── main.go
├── internal/
│   ├── ca/           # CA operations
│   ├── cert/         # Certificate generation
│   ├── config/       # Configuration
│   ├── crl/          # CRL management
│   ├── database/     # Certificate tracking
│   ├── keystore/     # Storage backends
│   │   ├── interface.go
│   │   ├── filesystem.go
│   │   ├── hsm.go
│   │   └── cloudkms.go
│   ├── audit/        # Audit logging
│   ├── policy/       # Certificate policies
│   └── validation/   # Request validation
├── pkg/              # Public libraries (optional)
├── api/              # API definitions (if building service)
├── docs/
├── test/
├── scripts/
└── deployments/      # Docker, K8s configs
```

---

## Estimated Effort

- **Phase 1 (Critical):** 4 weeks (1 developer)
- **Phase 2 (High):** 4 weeks
- **Phase 3 (Medium):** 4 weeks
- **Testing & Hardening:** 2 weeks
- **Documentation:** 2 weeks

**Total:** ~4 months for production-ready PKI

---

## Dependencies to Add

```go
// Encryption
"golang.org/x/crypto/argon2"
"golang.org/x/crypto/pbkdf2"

// Database
"github.com/mattn/go-sqlite3"
// or "github.com/lib/pq" for PostgreSQL

// HSM Support
"github.com/miekg/pkcs11"

// Cloud KMS
"github.com/aws/aws-sdk-go-v2/service/kms"
"cloud.google.com/go/kms"
"github.com/Azure/azure-sdk-for-go/sdk/keyvault/azkeys"

// Logging
"go.uber.org/zap"
"github.com/sirupsen/logrus"

// Monitoring
"github.com/prometheus/client_golang"
```

---

## Testing Requirements

### Current: 62% coverage
### Production Target: >90% coverage

**Additional Tests Needed:**
- Security tests (encryption, key protection)
- Integration tests with HSM
- Load testing (concurrent operations)
- Penetration testing
- Compliance testing (FIPS 140-2, Common Criteria)

---

## Compliance Considerations

Depending on use case, may need:
- **FIPS 140-2** compliance (validated crypto modules)
- **Common Criteria** certification
- **WebTrust** audit (for public CA)
- **SOC 2** compliance
- **ISO 27001** certification

---

## Documentation Needs

- Security architecture document
- Threat model and risk assessment
- Operations runbook
- Incident response plan
- Disaster recovery procedures
- Certificate Policy (CP) and Certification Practice Statement (CPS)
- API documentation
- Administrator guide
- User guide

---

## Conclusion

To make `certy` production-ready:

**Minimum viable production (MVP):**
1. ✅ Private key encryption
2. ✅ PKCS#12 passwords
3. ✅ CRL support
4. ✅ Audit logging

**Full production-ready:**
- All of Phase 1-3
- Comprehensive testing
- Security audit
- Documentation

**Current certy is perfect for:**
- ✅ Development environments
- ✅ Testing
- ✅ Learning PKI concepts
- ✅ Local HTTPS development

**NOT suitable for (without enhancements):**
- ❌ Public-facing services
- ❌ Production infrastructure
- ❌ Compliance-required environments
- ❌ High-security applications

---

**Recommendation:** Keep current `certy` as a development tool and create a new `certy-pro` or `certy-enterprise` variant for production use with the security enhancements listed above.
