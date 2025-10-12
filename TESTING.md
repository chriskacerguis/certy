# Certy Test Suite Documentation

## Overview

The certy test suite provides comprehensive coverage of all functionality including:
- Unit tests for individual functions
- Integration tests for end-to-end workflows
- OpenSSL compatibility verification
- Certificate chain validation

## Test Files

### `config_test.go`
Tests for configuration management:
- Default configuration values
- CA directory resolution (custom dir, CAROOT env, default)
- Configuration persistence (save/load)
- Serial number generation and incrementation
- CA existence checks
- File path resolution

### `ca_test.go`
Tests for Certificate Authority operations:
- Root CA generation
- Intermediate CA generation
- CA installation
- CA file persistence
- Certificate chain validation
- File permissions for CA keys (0600)

### `cert_test.go`
Tests for certificate generation:
- Input parsing (domains, IPs, emails)
- Common name determination
- Output path generation
- Filename sanitization
- Certificate saving/loading
- Certificate type detection
- Certificate generation (TLS, Client, S/MIME)
- RSA and ECDSA key generation
- Subject Alternative Names (SANs)

### `pkcs12_test.go`
Tests for PKCS#12 operations:
- PKCS#12 generation with RSA keys
- PKCS#12 generation with ECDSA keys
- Certificate chain inclusion
- File permissions (0600)
- Empty password support

### `integration_test.go`
End-to-end integration tests:
- Full workflow (install → generate → verify)
- Certificate chain validation with crypto/x509
- Serial number incrementation across multiple certs
- Custom output paths
- Multiple independent CA directories
- OpenSSL compatibility verification

## Running Tests

### Run all tests
```bash
make test
```

### Run with coverage
```bash
make test-coverage
```

### View coverage report in browser
```bash
make test-coverage-html
```

### Run only unit tests
```bash
make test-unit
```

### Run only integration tests
```bash
make test-integration
```

### Run specific test
```bash
go test -run TestGenerateCertificate -v
```

### Run tests for specific file
```bash
go test -v ./... -run Config
```

## Coverage Goals

- **Overall**: > 85% coverage
- **Critical paths**: 100% coverage
  - CA generation (ca.go)
  - Certificate generation (cert.go)
  - Configuration management (config.go)

## Test Patterns

### Using Temporary Directories
All tests use `t.TempDir()` for isolated test environments:
```go
tmpDir := t.TempDir()
customCADir = tmpDir
defer func() { customCADir = "" }()
```

### Table-Driven Tests
Many tests use table-driven patterns for comprehensive coverage:
```go
tests := []struct {
    name     string
    input    string
    expected string
}{
    {"test case 1", "input1", "output1"},
    {"test case 2", "input2", "output2"},
}

for _, tt := range tests {
    t.Run(tt.name, func(t *testing.T) {
        // test logic
    })
}
```

### Integration Test Naming
Integration tests are prefixed with `TestIntegration_` to allow selective running.

### Helper Functions
Common operations are extracted to helper functions:
- `verifyCertificateFile()`: Verify cert file and properties
- `verifyKeyFile()`: Verify key file and permissions
- `loadCertFromFile()`: Load and parse certificate

## CI/CD Integration

### GitHub Actions
The test suite integrates with GitHub Actions CI:
```yaml
- name: Run tests
  run: make test-ci
```

### Coverage Reporting
Coverage data is generated in atomic mode for accurate results:
```bash
go test -coverprofile=coverage.out -covermode=atomic ./...
```

## OpenSSL Compatibility

Integration tests include OpenSSL verification when available:
- Verifies certificate chain using `openssl verify`
- Skips gracefully if OpenSSL is not installed
- Tests both root CA and intermediate CA chain

## Test Dependencies

Required for full test suite:
- Go 1.21+
- `software.sslmate.com/src/go-pkcs12` (via go.mod)
- `gopkg.in/yaml.v3` (via go.mod)
- OpenSSL (optional, for compatibility tests)

## Common Test Scenarios

### 1. CA Installation
```go
if err := installCA(); err != nil {
    t.Fatalf("Failed to install CA: %v", err)
}
```

### 2. Certificate Generation
```go
cfg, _ := loadConfig()
certPath, keyPath, err := generateCertificate(
    []string{"example.com"},
    CertTypeTLS,
    false,
    "",
    "",
    cfg,
)
```

### 3. Certificate Verification
```go
roots := x509.NewCertPool()
roots.AddCert(rootCert)

opts := x509.VerifyOptions{
    Roots:   roots,
    DNSName: "example.com",
}

if _, err := cert.Verify(opts); err != nil {
    t.Errorf("Verification failed: %v", err)
}
```

## Benchmarks

To add benchmarks for performance-critical operations:
```bash
make bench
```

## Troubleshooting

### Tests fail with "CA not found"
Ensure each test creates its own CA with `installCA()` and uses `t.TempDir()`.

### Permission errors
Tests should use temporary directories with proper cleanup.

### Race conditions
All tests run with `-race` flag to detect race conditions.

## Adding New Tests

1. Follow existing naming conventions
2. Use table-driven tests where appropriate
3. Clean up resources with `defer`
4. Use `t.TempDir()` for isolation
5. Add integration tests for new workflows
6. Update this documentation

## Test Coverage by File

Current coverage targets:
- `ca.go`: 95%+
- `cert.go`: 95%+
- `config.go`: 100%
- `pkcs12.go`: 90%+
- `main.go`: Integration tests cover CLI paths

## Performance Considerations

- Tests use smaller key sizes where appropriate for speed
- Temporary directories auto-cleanup
- Parallel test execution supported
- Race detector enabled by default
