.PHONY: test test-coverage test-integration test-unit clean help

# Variables
COVERAGE_DIR := coverage
COVERAGE_FILE := $(COVERAGE_DIR)/coverage.out
COVERAGE_HTML := $(COVERAGE_DIR)/coverage.html

help: ## Show this help message
	@echo "Available targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-20s %s\n", $$1, $$2}'

test: ## Run all tests
	@echo "Running all tests..."
	go test -v -race ./...

test-unit: ## Run unit tests only (excludes integration tests)
	@echo "Running unit tests..."
	go test -v -race -short ./...

test-integration: ## Run integration tests only
	@echo "Running integration tests..."
	go test -v -race -run Integration ./...

test-coverage: ## Run tests with coverage report
	@echo "Running tests with coverage..."
	@mkdir -p $(COVERAGE_DIR)
	go test -v -race -coverprofile=$(COVERAGE_FILE) -covermode=atomic ./...
	@echo ""
	@echo "Coverage summary:"
	go tool cover -func=$(COVERAGE_FILE) | grep total
	@echo ""
	@echo "Generating HTML coverage report..."
	go tool cover -html=$(COVERAGE_FILE) -o $(COVERAGE_HTML)
	@echo "Coverage report generated: $(COVERAGE_HTML)"

test-coverage-html: test-coverage ## Generate and open HTML coverage report
	@echo "Opening coverage report in browser..."
	@open $(COVERAGE_HTML) 2>/dev/null || xdg-open $(COVERAGE_HTML) 2>/dev/null || echo "Please open $(COVERAGE_HTML) manually"

bench: ## Run benchmarks
	@echo "Running benchmarks..."
	go test -bench=. -benchmem ./...

vet: ## Run go vet
	@echo "Running go vet..."
	go vet ./...

fmt: ## Format code
	@echo "Formatting code..."
	go fmt ./...

lint: ## Run linters
	@echo "Running linters..."
	@if command -v golangci-lint > /dev/null; then \
		golangci-lint run; \
	else \
		echo "golangci-lint not installed. Run: go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest"; \
	fi

build: ## Build the binary
	@echo "Building certy..."
	go build -ldflags "-X main.version=dev" -o certy

clean: ## Clean test artifacts and build files
	@echo "Cleaning..."
	rm -rf $(COVERAGE_DIR)
	rm -f certy
	go clean -testcache

test-ci: vet ## Run tests suitable for CI
	@echo "Running CI tests..."
	@mkdir -p $(COVERAGE_DIR)
	go test -v -race -coverprofile=$(COVERAGE_FILE) -covermode=atomic ./...
	go tool cover -func=$(COVERAGE_FILE)

# Development shortcuts
quick-test: ## Quick test without race detector (faster)
	go test ./...

watch: ## Watch for changes and run tests (requires entr)
	@echo "Watching for changes... (requires 'entr' to be installed)"
	@find . -name '*.go' | entr -c make quick-test

.DEFAULT_GOAL := help
