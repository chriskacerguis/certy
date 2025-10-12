# Test Coverage Summary

[![CI](https://github.com/chriskacerguis/certy/workflows/CI/badge.svg)](https://github.com/chriskacerguis/certy/actions)
[![codecov](https://codecov.io/gh/chriskacerguis/certy/branch/main/graph/badge.svg)](https://codecov.io/gh/chriskacerguis/certy)

## Current Coverage: 62.0%

### Coverage by File

| File | Coverage | Status |
|------|----------|--------|
| `config.go` | 78.6% | ✅ Good |
| `cert.go` | 82.3% | ✅ Good |
| `ca.go` | 69.7% | ✅ Good |
| `pkcs12.go` | 66.7% | ⚠️ Fair |
| `main.go` | 33.3% | ⚠️ CLI only |

### Test Files

- **`ca_test.go`**: 7 tests - CA generation and management
- **`cert_test.go`**: 8 tests + 28 subtests - Certificate generation
- **`config_test.go`**: 6 tests - Configuration management
- **`pkcs12_test.go`**: 3 tests - PKCS#12 operations
- **`csr_test.go`**: 4 tests - CSR-based certificate generation
- **`integration_test.go`**: 6 tests - End-to-end workflows

**Total**: 34 tests + 28 subtests = **62 test cases**

## Quick Start

```bash
# Run all tests
make test

# Run with coverage
make test-coverage

# View HTML coverage report
make test-coverage-html

# Run only integration tests
make test-integration

# Run only unit tests
make test-unit
```

## Test Categories

### Unit Tests (Fast)
- Configuration parsing and validation
- Input parsing (domains, IPs, emails)
- Filename sanitization
- Certificate type detection
- Path determination

### Integration Tests (Slower)
- Full CA installation workflow
- Certificate chain validation
- OpenSSL compatibility verification
- Multi-certificate serial number tracking
- Custom CA directory isolation

### CSR Tests
- CSR parsing and validation
- Certificate generation from CSR
- Multi-SAN CSR handling
- Invalid CSR error handling

## CI/CD

Tests run automatically on:
- Push to `main` branch
- Pull requests
- Multiple platforms (Ubuntu, macOS, Windows)
- Multiple Go versions (1.23+)

## Coverage Goals

- **Target**: 70%+ overall coverage
- **Critical paths**: 90%+ coverage
  - CA generation
  - Certificate signing
  - Chain validation

## Running Specific Tests

```bash
# Run specific test
go test -v -run TestGenerateCertificate

# Run tests for specific file
go test -v -run Config

# Run with race detector
go test -race ./...

# Run benchmarks
go test -bench=. ./...
```

## Test Data

All tests use:
- Temporary directories (`t.TempDir()`)
- Isolated CA environments
- Automatic cleanup
- No shared state between tests

## OpenSSL Integration

Integration tests include OpenSSL verification when available:
```bash
openssl verify -CAfile rootCA.pem -untrusted intermediateCA.pem cert.pem
```

Tests gracefully skip if OpenSSL is not installed.

## Adding New Tests

1. Follow existing naming patterns
2. Use table-driven tests where appropriate
3. Clean up resources with `defer`
4. Use `t.TempDir()` for isolation
5. Add to appropriate test file
6. Update this summary

## Documentation

See [TESTING.md](TESTING.md) for detailed test documentation.
