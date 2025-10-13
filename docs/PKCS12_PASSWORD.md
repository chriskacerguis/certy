# PKCS#12 Password Protection

## Overview

Added optional password protection for PKCS#12 (`.p12`/`.pfx`) files in v1.0.3+. This allows users to protect exported certificates with a password while maintaining backward compatibility for no-password exports.

## Implementation Details

### New Flag

**`-p12-password <password>`** - Optional password for PKCS#12 file protection

- Empty/omitted = No password protection (backward compatible)
- Provided = Password-protected PKCS#12 file

### Function Signature Change

**Before (v1.0.2):**
```go
func generatePKCS12(certPath, keyPath, p12Path string) error
```

**After (v1.0.3+):**
```go
func generatePKCS12(certPath, keyPath, p12Path, password string) error
```

The `password` parameter is passed directly to `pkcs12.Modern.Encode()`:
- Empty string = No encryption
- Non-empty string = Password-protected

## Usage Examples

### No Password (Backward Compatible)

```bash
# Original usage still works
certy -pkcs12 example.com

# Explicitly no password
certy -pkcs12 -p12-password "" example.com
```

### With Password Protection

```bash
# Simple password
certy -pkcs12 -p12-password "MyPassword123!" example.com

# From environment variable
export P12_PASSWORD="MySecurePassword"
certy -pkcs12 -p12-password "$P12_PASSWORD" example.com

# With custom output path
certy -pkcs12 -p12-file ./secure.p12 -p12-password "secret" example.com
```

### Verification with OpenSSL

```bash
# Test with password
openssl pkcs12 -in example.com.p12 -noout -passin pass:MyPassword123!

# Test without password (empty password)
openssl pkcs12 -in example.com.p12 -noout -passin pass:
```

## Test Coverage

### New Test Cases (2 tests)

1. **`TestGeneratePKCS12WithPassword`**
   - Generates password-protected PKCS#12 file
   - Verifies file can be decoded with correct password
   - Verifies file CANNOT be decoded with wrong password
   - Verifies file CANNOT be decoded with empty password

2. **`TestGeneratePKCS12WithEmptyPassword`**
   - Generates PKCS#12 file with no password
   - Verifies backward compatibility
   - Verifies file can be decoded with empty password

### Updated Tests (4 tests)

All existing PKCS#12 tests updated to pass empty password:
- `TestGeneratePKCS12`
- `TestGeneratePKCS12WithECDSA`
- `TestPKCS12FilePermissions`
- Integration test PKCS#12 generation

### Coverage Impact

**Before:** 64.3% coverage, 98 test cases  
**After:** 64.1% coverage, 100 test cases (+2)

*Note: Slight coverage decrease is due to new code paths added*

## Security Considerations

### Command-Line Visibility ⚠️

**Issue:** Passwords passed via `-p12-password` are visible in:
- Process list (`ps aux`)
- Shell history
- Log files

**Mitigations:**

1. **Environment Variables (Recommended):**
```bash
export P12_PASSWORD="MySecurePassword"
certy -pkcs12 -p12-password "$P12_PASSWORD" example.com
```

2. **Prompt for Password (Future Enhancement):**
```bash
# Not yet implemented
certy -pkcs12 -p12-password-prompt example.com
```

3. **Password File (Future Enhancement):**
```bash
# Not yet implemented
certy -pkcs12 -p12-password-file /secure/path/password.txt example.com
```

### Production Recommendations

For production use:
- ✅ **DO:** Use environment variables for passwords
- ✅ **DO:** Use strong passwords (12+ characters, mixed case, numbers, symbols)
- ✅ **DO:** Secure the generated `.p12` file with appropriate permissions
- ❌ **DON'T:** Hard-code passwords in scripts
- ❌ **DON'T:** Use weak passwords like "password" or "123456"
- ❌ **DON'T:** Store passwords in version control

### Development Use

For development/testing:
- ✅ **OK:** No password (easier for local dev)
- ✅ **OK:** Simple passwords via command line
- ⚠️ **WARNING:** Don't share password-protected files with the password

## Files Modified

### Source Code

**`main.go`**
- Added `-p12-password` flag definition
- Updated `generatePKCS12()` call to pass password parameter

**`pkcs12.go`**
- Updated function signature to accept `password` parameter
- Updated `pkcs12.Modern.Encode()` call to use password
- Updated comments to reflect optional password

### Tests

**`pkcs12_test.go`**
- Added `TestGeneratePKCS12WithPassword` (password protection test)
- Added `TestGeneratePKCS12WithEmptyPassword` (backward compatibility test)
- Updated all existing tests to pass empty password parameter

**`integration_test.go`**
- Updated PKCS#12 generation call to pass empty password

### Documentation

**`README.md`**
- Updated PKCS#12 section with password examples
- Changed note from "empty password" to "optional password"

**`docs/PRODUCTION_READINESS.md`**
- Moved PKCS#12 Password Protection from "Critical Issues" to "Completed Features"
- Updated implementation priority to show as completed (v1.0.3+)

**`.github/copilot-instructions.md`**
- Updated `generatePKCS12()` description to mention optional password

## Backward Compatibility

✅ **Fully backward compatible**

- Existing command `certy -pkcs12 example.com` works unchanged
- Generates PKCS#12 with no password (empty string)
- All existing tests updated but behavior unchanged
- No breaking changes to API or CLI

## Future Enhancements

### 1. Password Prompting
```go
func promptForPassword() string {
    fmt.Print("Enter PKCS#12 password: ")
    password, _ := terminal.ReadPassword(int(syscall.Stdin))
    return string(password)
}
```

### 2. Password File Support
```go
if *p12PasswordFile != "" {
    password, err := os.ReadFile(*p12PasswordFile)
    // Use password from file
}
```

### 3. Password Strength Validation
```go
func validatePasswordStrength(password string) error {
    if len(password) < 8 {
        return fmt.Errorf("password must be at least 8 characters")
    }
    // Check for mixed case, numbers, symbols
}
```

### 4. Environment Variable Detection
```go
if password == "" {
    password = os.Getenv("CERTY_P12_PASSWORD")
}
```

## Version History

- **v1.0.3+** - Initial implementation
  - Added `-p12-password` flag
  - Optional password protection
  - Full backward compatibility
  - 2 new test cases

## Related Documentation

- `README.md` - User-facing usage examples
- `docs/PRODUCTION_READINESS.md` - Production feature checklist
- `docs/TESTING.md` - Test suite documentation
- `.github/copilot-instructions.md` - Technical reference
