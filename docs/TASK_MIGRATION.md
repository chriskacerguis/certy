# Task Migration: Makefile → Taskfile.yml

## Overview

Migrated from GNU Make to [go-task](https://taskfile.dev) for better cross-platform compatibility, cleaner syntax, and improved developer experience.

## Why go-task?

### Advantages over Make

1. **Cross-platform**: Works identically on macOS, Linux, and Windows
2. **YAML syntax**: More readable and maintainable than Makefiles
3. **Built-in features**: Variable interpolation, dependencies, parallel execution
4. **Go-centric**: Designed for Go projects
5. **No make required**: Single binary, no system dependencies

### Migration Benefits

- ✅ All Makefile functionality preserved
- ✅ Additional features added (multi-platform builds, dev setup)
- ✅ Better error messages
- ✅ Faster task execution with caching
- ✅ Simpler syntax for contributors

## Installation

### macOS
```bash
brew install go-task/tap/go-task
```

### Linux
```bash
sh -c "$(curl --location https://taskfile.dev/install.sh)" -- -d -b /usr/local/bin
```

### Windows
```powershell
choco install go-task
```

### Go Install
```bash
go install github.com/go-task/task/v3/cmd/task@latest
```

## Task Comparison

| Old Makefile Command | New Task Command | Notes |
|---------------------|------------------|-------|
| `make help` | `task` or `task --list` | Default action |
| `make test` | `task test` | Same |
| `make test-unit` | `task test:unit` | Namespaced |
| `make test-integration` | `task test:integration` | Namespaced |
| `make test-coverage` | `task test:coverage` | Namespaced |
| `make test-coverage-html` | `task test:coverage:html` | Namespaced |
| `make quick-test` | `task test:quick` | Namespaced |
| `make test-ci` | `task test:ci` | Namespaced |
| `make bench` | `task bench` | Same |
| `make vet` | `task vet` | Same |
| `make fmt` | `task fmt` | Same |
| `make lint` | `task lint` | Same |
| `make build` | `task build` | Same |
| `make clean` | `task clean` | Same |
| `make watch` | `task watch` | Improved (supports watchexec) |
| N/A | `task build:all` | New: Multi-platform builds |
| N/A | `task build:linux` | New: Linux builds |
| N/A | `task build:darwin` | New: macOS builds |
| N/A | `task build:windows` | New: Windows builds |
| N/A | `task fmt:check` | New: Format checking |
| N/A | `task deps` | New: Download deps |
| N/A | `task deps:tidy` | New: Tidy modules |
| N/A | `task deps:verify` | New: Verify modules |
| N/A | `task check` | New: Run all checks |
| N/A | `task ci` | New: Full CI pipeline |
| N/A | `task dev` | New: Dev environment setup |
| N/A | `task install` | New: Install to $GOPATH/bin |

## New Features

### 1. Namespaced Tasks

Tasks are organized with colons for better grouping:

```bash
task test           # Run all tests
task test:unit      # Unit tests only
task test:coverage  # With coverage
task test:quick     # Quick tests
```

### 2. Multi-Platform Builds

```bash
# Build for all platforms
task build:all

# Build for specific platform
task build:linux
task build:darwin
task build:windows
```

### 3. Development Workflow

```bash
# Setup dev environment (installs tools)
task dev

# Run all quality checks
task check

# Full CI pipeline locally
task ci
```

### 4. Improved Watch Mode

Supports both `watchexec` and `entr`:

```bash
# Install watchexec (recommended)
brew install watchexec

# Run watch mode
task watch
```

### 5. Dependency Management

```bash
task deps           # Download dependencies
task deps:tidy      # Tidy go.mod
task deps:verify    # Verify checksums
```

## Task Structure

### Variables

Defined at the top of `Taskfile.yml`:

```yaml
vars:
  COVERAGE_DIR: coverage
  COVERAGE_FILE: '{{.COVERAGE_DIR}}/coverage.out'
  COVERAGE_HTML: '{{.COVERAGE_DIR}}/coverage.html'
  VERSION:
    sh: git describe --tags --always --dirty 2>/dev/null || echo "dev"
```

### Task Dependencies

Tasks can depend on other tasks:

```yaml
test:coverage:html:
  desc: Generate and open HTML coverage report
  deps: [test:coverage]  # Runs test:coverage first
  cmds:
    - open {{.COVERAGE_HTML}}
```

### Parallel Execution

Run multiple tasks in parallel:

```bash
task --parallel build:linux build:darwin build:windows
```

## Common Workflows

### Development

```bash
# First time setup
task dev

# Run tests quickly
task test:quick

# Watch for changes
task watch

# Format and lint
task fmt
task lint
```

### Testing

```bash
# All tests
task test

# Just unit tests
task test:unit

# With coverage
task test:coverage

# Open coverage in browser
task test:coverage:html
```

### Building

```bash
# Local build
task build

# Install to $GOPATH/bin
task install

# Multi-platform release builds
task build:all
```

### CI/CD

```bash
# Run everything CI runs
task ci

# Just the checks
task check
```

## Migration Notes

### Removed Features

None! All Makefile functionality was preserved.

### Added Features

- Multi-platform builds
- Format checking
- Dependency management tasks
- Development environment setup
- Full CI pipeline task
- Improved watch mode

### Behavioral Changes

1. **Task namespacing**: Uses colons (`:`) instead of hyphens (`-`)
2. **Default target**: Running `task` shows list instead of help text
3. **Watch mode**: Now supports `watchexec` (preferred) in addition to `entr`
4. **Version detection**: Automatically uses git tags for version

## Taskfile.yml Features Used

- **Variables**: For reusable values
- **Shell expansion**: Dynamic version from git
- **Dependencies**: Task prerequisites
- **Generates**: File generation tracking
- **Silent mode**: Cleaner output
- **Cross-platform**: Works on all OSes

## Performance

go-task includes smart features for performance:

- **Caching**: Tasks with `generates` are cached
- **Parallel execution**: Built-in parallel support
- **Incremental builds**: Only rebuilds when needed

## Documentation

- Official docs: https://taskfile.dev
- Installation: https://taskfile.dev/installation
- Task syntax: https://taskfile.dev/usage

## Backwards Compatibility

The old Makefile has been removed, but all commands have equivalent task commands. See the comparison table above for exact mappings.

For CI/CD pipelines that reference `make` commands:

```bash
# Old
make test

# New
task test
```

## VS Code Integration

Install the [Task extension](https://marketplace.visualstudio.com/items?itemName=task.vscode-task) for:

- Task listing in sidebar
- Run tasks from VS Code
- Task autocompletion

## Troubleshooting

### Task not found

```bash
# Check installation
which task

# Reinstall
brew install go-task
```

### Taskfile.yml syntax error

```bash
# Validate syntax
task --taskfile Taskfile.yml --list
```

### Missing dependencies

Some tasks require external tools:

```bash
# Install golangci-lint
go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest

# Install watchexec (for watch mode)
brew install watchexec
```

## Contributing

When adding new tasks:

1. Use descriptive names with colons for namespacing
2. Add a `desc:` field for documentation
3. Use variables for reusable values
4. Add to the appropriate category (test, build, etc.)

Example:

```yaml
test:benchmark:
  desc: Run benchmarks with memory profiling
  cmds:
    - echo "Running benchmarks..."
    - go test -bench=. -benchmem -memprofile=mem.out ./...
```
