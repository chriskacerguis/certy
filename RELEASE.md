# Release Process

## Creating a New Release

Certy uses GitHub Actions to automatically build and release binaries for multiple platforms.

### Automated Release (Recommended)

1. **Update version in code** (optional, but recommended):
   ```bash
   # The version will be auto-detected from the git tag
   git add .
   git commit -m "chore: prepare for release vX.Y.Z"
   git push
   ```

2. **Create and push a version tag**:
   ```bash
   git tag v1.0.2
   git push origin v1.0.2
   ```

3. **GitHub Actions will automatically**:
   - Build binaries for all supported platforms:
     - Linux: amd64, arm64, armv7
     - macOS: amd64 (Intel), arm64 (Apple Silicon)
     - Windows: amd64, arm64
   - Generate SHA256 checksums
   - Create a GitHub release with binaries and installation instructions

### Manual Workflow Trigger

You can also trigger the build workflow manually from the GitHub Actions tab:

1. Go to: `Actions` → `Build and Release`
2. Click `Run workflow`
3. Select branch and click `Run workflow`

This will build all platforms but won't create a release (only tag pushes create releases).

## Supported Platforms

| Platform | Architecture | Output Filename |
|----------|-------------|-----------------|
| Linux    | AMD64       | `certy-linux-amd64` |
| Linux    | ARM64       | `certy-linux-arm64` |
| Linux    | ARMv7       | `certy-linux-armv7` |
| macOS    | AMD64       | `certy-darwin-amd64` |
| macOS    | ARM64       | `certy-darwin-arm64` |
| Windows  | AMD64       | `certy-windows-amd64.exe` |
| Windows  | ARM64       | `certy-windows-arm64.exe` |

## Build Flags

All release binaries are built with the following flags:
```bash
go build -ldflags "-s -w -X main.version=$VERSION" -o <output>
```

Where:
- `-s`: Strip symbol table
- `-w`: Strip DWARF debug information
- `-X main.version=$VERSION`: Embed version from git tag

This produces optimized binaries (~5.7MB) with minimal size.

## Version Numbering

Follow semantic versioning: `vMAJOR.MINOR.PATCH`

- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes

Examples:
- `v1.0.0` - Initial release
- `v1.0.1` - Bug fix release
- `v1.1.0` - New feature (added `-ca-dir` flag)
- `v2.0.0` - Breaking change

## CI/CD Pipeline

### On every push/PR to main:
- Run tests
- Build for Linux, macOS, Windows
- Run linting (golangci-lint)
- Test certificate generation
- Verify CA installation

### On version tag push:
- All CI checks (above)
- Build release binaries for all platforms
- Generate checksums
- Create GitHub release with artifacts
