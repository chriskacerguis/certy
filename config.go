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
}

// DefaultConfig returns the default configuration
func DefaultConfig() *Config {
	return &Config{
		DefaultValidityDays: 365,
		RootCAValidityDays:  3650,
		IntCAValidityDays:   1825,
		DefaultKeyType:      "rsa",
		DefaultKeySize:      2048,
	}
}

// getCertyDir returns the directory where certy stores its files
func getCertyDir() (string, error) {
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

	return cfg, nil
}

// saveConfig saves the configuration to file
func saveConfig(cfg *Config) error {
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
