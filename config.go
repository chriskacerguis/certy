package main

import (
	"fmt"
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"
)

// Config represents the certy configuration
type Config struct {
	DefaultValidityDays int    `yaml:"default_validity_days"`
	RootCAValidityDays  int    `yaml:"root_ca_validity_days"`
	IntCAValidityDays   int    `yaml:"intermediate_ca_validity_days"`
	DefaultKeyType      string `yaml:"default_key_type"`
	DefaultKeySize      int    `yaml:"default_key_size"`
	CRLURL              string `yaml:"crl_url"` // CRL distribution point URL
}

// DefaultConfig returns the default configuration
func DefaultConfig() *Config {
	return &Config{
		DefaultValidityDays: 365,
		RootCAValidityDays:  3650,
		IntCAValidityDays:   1825,
		DefaultKeyType:      "rsa",
		DefaultKeySize:      2048,
		CRLURL:              "http://crl.local/intermediate.crl", // Default CRL distribution point
	}
}

// getCertyDir returns the directory where certy stores its files
func getCertyDir() (string, error) {
	// Priority 1: Use custom directory if specified via -ca-dir flag
	if customCADir != "" {
		absPath, err := filepath.Abs(customCADir)
		if err != nil {
			return "", fmt.Errorf("failed to resolve CA directory path: %w", err)
		}
		return absPath, nil
	}

	// Priority 2: Use CAROOT environment variable if set
	if caroot := os.Getenv("CAROOT"); caroot != "" {
		absPath, err := filepath.Abs(caroot)
		if err != nil {
			return "", fmt.Errorf("failed to resolve CAROOT path: %w", err)
		}
		return absPath, nil
	}

	// Priority 3: Default to ~/.certy
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("failed to get home directory: %w", err)
	}
	return filepath.Join(home, ".certy"), nil
}

// getConfigPath returns the path to the config file
func getConfigPath() (string, error) {
	dir, err := getCertyDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "config.yml"), nil
}

// loadConfig loads the configuration from file or returns defaults
func loadConfig() (*Config, error) {
	configPath, err := getConfigPath()
	if err != nil {
		return nil, err
	}

	// If config file doesn't exist, return defaults
	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		return DefaultConfig(), nil
	}

	// Read config file
	data, err := os.ReadFile(configPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read config file: %w", err)
	}

	// Parse YAML
	cfg := DefaultConfig()
	if err := yaml.Unmarshal(data, cfg); err != nil {
		return nil, fmt.Errorf("failed to parse config file: %w", err)
	}

	// Validate configuration
	if err := validateConfig(cfg); err != nil {
		return nil, fmt.Errorf("invalid configuration: %w", err)
	}

	return cfg, nil
}

// validateConfig validates the configuration values
func validateConfig(cfg *Config) error {
	// Validate validity periods
	if cfg.DefaultValidityDays < 1 {
		return fmt.Errorf("default_validity_days must be at least 1, got %d", cfg.DefaultValidityDays)
	}
	if cfg.DefaultValidityDays > 825 {
		return fmt.Errorf("default_validity_days cannot exceed 825 (27 months), got %d", cfg.DefaultValidityDays)
	}

	if cfg.RootCAValidityDays < 365 {
		return fmt.Errorf("root_ca_validity_days must be at least 365, got %d", cfg.RootCAValidityDays)
	}
	if cfg.RootCAValidityDays > 7300 {
		return fmt.Errorf("root_ca_validity_days cannot exceed 7300 (20 years), got %d", cfg.RootCAValidityDays)
	}

	if cfg.IntCAValidityDays < 365 {
		return fmt.Errorf("intermediate_ca_validity_days must be at least 365, got %d", cfg.IntCAValidityDays)
	}
	if cfg.IntCAValidityDays > 3650 {
		return fmt.Errorf("intermediate_ca_validity_days cannot exceed 3650 (10 years), got %d", cfg.IntCAValidityDays)
	}

	// Validate key type
	if cfg.DefaultKeyType != "rsa" && cfg.DefaultKeyType != "ecdsa" {
		return fmt.Errorf("default_key_type must be 'rsa' or 'ecdsa', got '%s'", cfg.DefaultKeyType)
	}

	// Validate key size
	if cfg.DefaultKeyType == "rsa" {
		// RSA key sizes must be 2048, 3072, or 4096
		if cfg.DefaultKeySize != 2048 && cfg.DefaultKeySize != 3072 && cfg.DefaultKeySize != 4096 {
			return fmt.Errorf("default_key_size for RSA must be 2048, 3072, or 4096, got %d", cfg.DefaultKeySize)
		}
	} else if cfg.DefaultKeyType == "ecdsa" {
		// ECDSA key sizes must be 256, 384, or 521 (P-256, P-384, P-521)
		if cfg.DefaultKeySize != 256 && cfg.DefaultKeySize != 384 && cfg.DefaultKeySize != 521 {
			return fmt.Errorf("default_key_size for ECDSA must be 256, 384, or 521, got %d", cfg.DefaultKeySize)
		}
	}

	// Validate intermediate CA validity is less than root CA
	if cfg.IntCAValidityDays >= cfg.RootCAValidityDays {
		return fmt.Errorf("intermediate_ca_validity_days (%d) must be less than root_ca_validity_days (%d)",
			cfg.IntCAValidityDays, cfg.RootCAValidityDays)
	}

	return nil
}

// saveConfig saves the configuration to file
func saveConfig(cfg *Config) error {
	// Validate before saving
	if err := validateConfig(cfg); err != nil {
		return fmt.Errorf("invalid configuration: %w", err)
	}

	configPath, err := getConfigPath()
	if err != nil {
		return err
	}

	// Ensure directory exists
	dir := filepath.Dir(configPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("failed to create config directory: %w", err)
	}

	// Marshal to YAML
	data, err := yaml.Marshal(cfg)
	if err != nil {
		return fmt.Errorf("failed to marshal config: %w", err)
	}

	// Write to file
	if err := os.WriteFile(configPath, data, 0644); err != nil {
		return fmt.Errorf("failed to write config file: %w", err)
	}

	return nil
}

// getCAFilePath returns the path to a CA file
func getCAFilePath(filename string) (string, error) {
	dir, err := getCertyDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, filename), nil
}

// caExists checks if the CA infrastructure is installed
func caExists() bool {
	files := []string{"rootCA.pem", "rootCA-key.pem", "intermediateCA.pem", "intermediateCA-key.pem"}
	for _, file := range files {
		path, err := getCAFilePath(file)
		if err != nil {
			return false
		}
		if _, err := os.Stat(path); os.IsNotExist(err) {
			return false
		}
	}
	return true
}

// getSerialNumber reads and increments the serial number
func getSerialNumber() (int64, error) {
	serialPath, err := getCAFilePath("serial.txt")
	if err != nil {
		return 0, err
	}

	// Initialize serial file if it doesn't exist
	if _, err := os.Stat(serialPath); os.IsNotExist(err) {
		if err := os.WriteFile(serialPath, []byte("1"), 0644); err != nil {
			return 0, fmt.Errorf("failed to initialize serial file: %w", err)
		}
		return 1, nil
	}

	// Read current serial
	data, err := os.ReadFile(serialPath)
	if err != nil {
		return 0, fmt.Errorf("failed to read serial file: %w", err)
	}

	var serial int64
	if _, err := fmt.Sscanf(string(data), "%d", &serial); err != nil {
		return 0, fmt.Errorf("failed to parse serial number: %w", err)
	}

	// Increment and save
	nextSerial := serial + 1
	if err := os.WriteFile(serialPath, []byte(fmt.Sprintf("%d", nextSerial)), 0644); err != nil {
		return 0, fmt.Errorf("failed to update serial file: %w", err)
	}

	return serial, nil
}
