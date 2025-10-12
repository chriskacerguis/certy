# Configuration Validation Implementation

## Overview

Added comprehensive validation for all `config.yml` parameters to prevent invalid configurations from causing security issues or runtime errors.

## Implementation Details

### Validation Function

**Location:** `config.go` - `validateConfig(cfg *Config) error`

**Called By:**
- `loadConfig()` - Validates after loading from YAML
- `saveConfig()` - Validates before saving to disk

### Validation Rules

#### Validity Periods

| Parameter | Min | Max | Description |
|-----------|-----|-----|-------------|
| `default_validity_days` | 1 | 825 | End-entity cert validity (max ~2.25 years) |
| `root_ca_validity_days` | 365 | 7300 | Root CA validity (1-20 years) |
| `intermediate_ca_validity_days` | 365 | 3650 | Intermediate CA validity (1-10 years) |

**Additional Check:** Intermediate CA validity must be less than Root CA validity to maintain proper certificate hierarchy.

#### Key Types

**Allowed Values:**
- `rsa` (RSA keys)
- `ecdsa` (Elliptic Curve keys)

**Case Sensitive:** Must be lowercase exactly as shown.

#### Key Sizes

**RSA Keys:**
- `2048` bits (default, widely compatible)
- `3072` bits (higher security)
- `4096` bits (maximum security)

**ECDSA Keys:**
- `256` bits (P-256 curve, default)
- `384` bits (P-384 curve)
- `521` bits (P-521 curve, note: 521 not 512)

## Error Examples

```yaml
# Invalid: Negative validity
default_validity_days: -365
# Error: default_validity_days must be at least 1

# Invalid: Excessive validity
default_validity_days: 1000
# Error: default_validity_days cannot exceed 825 days

# Invalid: Weak RSA key
default_key_type: rsa
default_key_size: 1024
# Error: default_key_size for RSA must be 2048, 3072, or 4096

# Invalid: Wrong ECDSA curve size
default_key_type: ecdsa
default_key_size: 512
# Error: default_key_size for ECDSA must be 256, 384, or 521

# Invalid: Hierarchy violation
root_ca_validity_days: 1825
intermediate_ca_validity_days: 3650
# Error: intermediate_ca_validity_days (3650) must be less than root_ca_validity_days (1825)
```

## Test Coverage

### Test Files

**`config_test.go`** - Added 3 test functions with 23 subtests:

1. **`TestValidateConfig`** (18 subtests)
   - Valid configurations (default, custom RSA, ECDSA variants)
   - Invalid validity periods (negative, zero, excessive, hierarchy violations)
   - Invalid key types
   - Invalid key sizes for both RSA and ECDSA

2. **`TestLoadConfigWithValidation`** (3 subtests)
   - Loading valid config files
   - Rejecting invalid configs during load
   - Error message verification

3. **`TestSaveConfigWithValidation`** (2 subtests)
   - Saving valid configs
   - Preventing save of invalid configs

### Coverage Impact

**Before:** 62.0% code coverage, 62 test cases  
**After:** 64.3% code coverage, 98 test cases (+36 test cases)

## Security Benefits

### Prevents

1. **Weak Cryptography:**
   - Blocks RSA keys smaller than 2048 bits
   - Prevents invalid ECDSA curve sizes

2. **Invalid Certificate Hierarchies:**
   - Ensures intermediate CA doesn't outlive root CA
   - Maintains proper chain of trust validity periods

3. **Operational Issues:**
   - Catches configuration errors at load time
   - Prevents creation of certificates with invalid parameters
   - Provides clear error messages for misconfiguration

4. **Compliance Violations:**
   - Enforces maximum validity periods aligned with industry standards
   - Prevents certificates that might violate CA/Browser Forum requirements

## Usage

### Default Configuration (Always Valid)

```go
cfg := DefaultConfig()
// No validation errors - defaults are guaranteed valid
```

### Loading User Configuration

```go
cfg, err := loadConfig()
if err != nil {
    // Will contain specific validation error if config is invalid
    fatal("Configuration validation failed: %v", err)
}
```

### Programmatic Validation

```go
cfg := &Config{
    DefaultValidityDays: 730,
    RootCAValidityDays:  3650,
    IntCAValidityDays:   1825,
    DefaultKeyType:      "rsa",
    DefaultKeySize:      4096,
}

if err := validateConfig(cfg); err != nil {
    // Handle validation error
}
```

## Integration with Existing Code

### No Breaking Changes

- Validation is transparent to existing functionality
- Default config always passes validation
- Only affects invalid configurations (which should fail anyway)

### Error Handling

All validation errors are returned as descriptive `fmt.Errorf()` messages that include:
- The parameter name
- The invalid value
- The allowed range or values

Example:
```
default_validity_days must be at least 1 (got: -365)
default_key_size for RSA must be 2048, 3072, or 4096 (got: 1024)
```

## Future Enhancements

Potential additions to validation:

1. **Custom Validity Ranges:**
   - Allow configuration of min/max bounds
   - Support for organizational policies

2. **Key Algorithm Restrictions:**
   - Option to disable specific algorithms
   - Enforce algorithm choices per cert type

3. **Extended Validation:**
   - Validate against external policy files
   - Integration with certificate policy OIDs

4. **Warning System:**
   - Non-fatal warnings for suboptimal configs
   - Deprecation notices for old algorithms

## Related Documentation

- `docs/PRODUCTION_READINESS.md` - Production feature roadmap
- `docs/TESTING.md` - Test suite documentation
- `README.md` - User-facing configuration documentation
- `.github/copilot-instructions.md` - Project technical reference

## Version History

- **v1.0.2+** - Initial implementation
  - Comprehensive validation for all config parameters
  - 23 test cases covering all validation scenarios
  - Integration with load/save operations
