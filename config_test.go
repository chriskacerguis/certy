package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestDefaultConfig(t *testing.T) {
	cfg := DefaultConfig()

	if cfg.DefaultValidityDays != 365 {
		t.Errorf("Expected DefaultValidityDays to be 365, got %d", cfg.DefaultValidityDays)
	}
	if cfg.RootCAValidityDays != 3650 {
		t.Errorf("Expected RootCAValidityDays to be 3650, got %d", cfg.RootCAValidityDays)
	}
	if cfg.IntCAValidityDays != 1825 {
		t.Errorf("Expected IntCAValidityDays to be 1825, got %d", cfg.IntCAValidityDays)
	}
	if cfg.DefaultKeyType != "rsa" {
		t.Errorf("Expected DefaultKeyType to be 'rsa', got %s", cfg.DefaultKeyType)
	}
	if cfg.DefaultKeySize != 2048 {
		t.Errorf("Expected DefaultKeySize to be 2048, got %d", cfg.DefaultKeySize)
	}
}

func TestGetCertyDir(t *testing.T) {
	// Save original values
	origCustomCADir := customCADir
	origCAROOT := os.Getenv("CAROOT")

	// Restore after test
	defer func() {
		customCADir = origCustomCADir
		os.Setenv("CAROOT", origCAROOT)
	}()

	t.Run("custom CA dir takes priority", func(t *testing.T) {
		customCADir = "/tmp/custom-ca"
		os.Unsetenv("CAROOT")

		dir, err := getCertyDir()
		if err != nil {
			t.Fatalf("Unexpected error: %v", err)
		}

		expected, _ := filepath.Abs("/tmp/custom-ca")
		if dir != expected {
			t.Errorf("Expected %s, got %s", expected, dir)
		}
	})

	t.Run("CAROOT env var second priority", func(t *testing.T) {
		customCADir = ""
		os.Setenv("CAROOT", "/tmp/caroot")

		dir, err := getCertyDir()
		if err != nil {
			t.Fatalf("Unexpected error: %v", err)
		}

		expected, _ := filepath.Abs("/tmp/caroot")
		if dir != expected {
			t.Errorf("Expected %s, got %s", expected, dir)
		}
	})

	t.Run("default to ~/.certy", func(t *testing.T) {
		customCADir = ""
		os.Unsetenv("CAROOT")

		dir, err := getCertyDir()
		if err != nil {
			t.Fatalf("Unexpected error: %v", err)
		}

		home, _ := os.UserHomeDir()
		expected := filepath.Join(home, ".certy")
		if dir != expected {
			t.Errorf("Expected %s, got %s", expected, dir)
		}
	})
}

func TestConfigPersistence(t *testing.T) {
	// Create temp directory
	tmpDir := t.TempDir()
	customCADir = tmpDir
	defer func() { customCADir = "" }()

	// Create config
	cfg := DefaultConfig()
	cfg.DefaultValidityDays = 730

	// Save config
	if err := saveConfig(cfg); err != nil {
		t.Fatalf("Failed to save config: %v", err)
	}

	// Load config
	loaded, err := loadConfig()
	if err != nil {
		t.Fatalf("Failed to load config: %v", err)
	}

	// Verify
	if loaded.DefaultValidityDays != 730 {
		t.Errorf("Expected DefaultValidityDays to be 730, got %d", loaded.DefaultValidityDays)
	}
}

func TestGetSerialNumber(t *testing.T) {
	// Create temp directory
	tmpDir := t.TempDir()
	customCADir = tmpDir
	defer func() { customCADir = "" }()

	// Note: getSerialNumber() returns the current serial, then increments
	// So sequential calls return the same value, then increment the file

	// Initialize serial file
	serialPath := filepath.Join(tmpDir, "serial.txt")
	if err := os.WriteFile(serialPath, []byte("1"), 0644); err != nil {
		t.Fatalf("Failed to initialize serial: %v", err)
	}

	// First call should return 1, file becomes 2
	serial1, err := getSerialNumber()
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}
	if serial1 != 1 {
		t.Errorf("Expected first serial to be 1, got %d", serial1)
	}

	// Second call should return 2, file becomes 3
	serial2, err := getSerialNumber()
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}
	if serial2 != 2 {
		t.Errorf("Expected second serial to be 2, got %d", serial2)
	}

	// Third call should return 3, file becomes 4
	serial3, err := getSerialNumber()
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}
	if serial3 != 3 {
		t.Errorf("Expected third serial to be 3, got %d", serial3)
	}
}

func TestCAExists(t *testing.T) {
	// Create temp directory
	tmpDir := t.TempDir()
	customCADir = tmpDir
	defer func() { customCADir = "" }()

	// Should not exist initially
	if caExists() {
		t.Error("CA should not exist in empty directory")
	}

	// Create all required files
	files := []string{"rootCA.pem", "rootCA-key.pem", "intermediateCA.pem", "intermediateCA-key.pem"}
	for _, file := range files {
		path := filepath.Join(tmpDir, file)
		if err := os.WriteFile(path, []byte("test"), 0644); err != nil {
			t.Fatalf("Failed to create test file: %v", err)
		}
	}

	// Should exist now
	if !caExists() {
		t.Error("CA should exist after creating all files")
	}

	// Remove one file
	os.Remove(filepath.Join(tmpDir, "rootCA.pem"))

	// Should not exist anymore
	if caExists() {
		t.Error("CA should not exist after removing a file")
	}
}

func TestGetCAFilePath(t *testing.T) {
	// Create temp directory
	tmpDir := t.TempDir()
	customCADir = tmpDir
	defer func() { customCADir = "" }()

	path, err := getCAFilePath("test.pem")
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}

	expected := filepath.Join(tmpDir, "test.pem")
	if path != expected {
		t.Errorf("Expected %s, got %s", expected, path)
	}
}

func TestValidateConfig(t *testing.T) {
	tests := []struct {
		name    string
		config  *Config
		wantErr bool
		errMsg  string
	}{
		{
			name:    "valid default config",
			config:  DefaultConfig(),
			wantErr: false,
		},
		{
			name: "valid custom config",
			config: &Config{
				DefaultValidityDays: 730,
				RootCAValidityDays:  3650,
				IntCAValidityDays:   1825,
				DefaultKeyType:      "rsa",
				DefaultKeySize:      4096,
			},
			wantErr: false,
		},
		{
			name: "negative default validity",
			config: &Config{
				DefaultValidityDays: -365,
				RootCAValidityDays:  3650,
				IntCAValidityDays:   1825,
				DefaultKeyType:      "rsa",
				DefaultKeySize:      2048,
			},
			wantErr: true,
			errMsg:  "default_validity_days must be at least 1",
		},
		{
			name: "zero default validity",
			config: &Config{
				DefaultValidityDays: 0,
				RootCAValidityDays:  3650,
				IntCAValidityDays:   1825,
				DefaultKeyType:      "rsa",
				DefaultKeySize:      2048,
			},
			wantErr: true,
			errMsg:  "default_validity_days must be at least 1",
		},
		{
			name: "excessive default validity",
			config: &Config{
				DefaultValidityDays: 1000,
				RootCAValidityDays:  3650,
				IntCAValidityDays:   1825,
				DefaultKeyType:      "rsa",
				DefaultKeySize:      2048,
			},
			wantErr: true,
			errMsg:  "default_validity_days cannot exceed 825",
		},
		{
			name: "root CA validity too short",
			config: &Config{
				DefaultValidityDays: 365,
				RootCAValidityDays:  180,
				IntCAValidityDays:   90,
				DefaultKeyType:      "rsa",
				DefaultKeySize:      2048,
			},
			wantErr: true,
			errMsg:  "root_ca_validity_days must be at least 365",
		},
		{
			name: "root CA validity too long",
			config: &Config{
				DefaultValidityDays: 365,
				RootCAValidityDays:  10000,
				IntCAValidityDays:   1825,
				DefaultKeyType:      "rsa",
				DefaultKeySize:      2048,
			},
			wantErr: true,
			errMsg:  "root_ca_validity_days cannot exceed 7300",
		},
		{
			name: "intermediate CA validity too short",
			config: &Config{
				DefaultValidityDays: 365,
				RootCAValidityDays:  3650,
				IntCAValidityDays:   180,
				DefaultKeyType:      "rsa",
				DefaultKeySize:      2048,
			},
			wantErr: true,
			errMsg:  "intermediate_ca_validity_days must be at least 365",
		},
		{
			name: "intermediate CA validity too long",
			config: &Config{
				DefaultValidityDays: 365,
				RootCAValidityDays:  5000,
				IntCAValidityDays:   4000,
				DefaultKeyType:      "rsa",
				DefaultKeySize:      2048,
			},
			wantErr: true,
			errMsg:  "intermediate_ca_validity_days cannot exceed 3650",
		},
		{
			name: "intermediate CA longer than root CA",
			config: &Config{
				DefaultValidityDays: 365,
				RootCAValidityDays:  1825,
				IntCAValidityDays:   3650,
				DefaultKeyType:      "rsa",
				DefaultKeySize:      2048,
			},
			wantErr: true,
			errMsg:  "intermediate_ca_validity_days",
		},
		{
			name: "invalid key type",
			config: &Config{
				DefaultValidityDays: 365,
				RootCAValidityDays:  3650,
				IntCAValidityDays:   1825,
				DefaultKeyType:      "invalid",
				DefaultKeySize:      2048,
			},
			wantErr: true,
			errMsg:  "default_key_type must be 'rsa' or 'ecdsa'",
		},
		{
			name: "invalid RSA key size",
			config: &Config{
				DefaultValidityDays: 365,
				RootCAValidityDays:  3650,
				IntCAValidityDays:   1825,
				DefaultKeyType:      "rsa",
				DefaultKeySize:      1024,
			},
			wantErr: true,
			errMsg:  "default_key_size for RSA must be 2048, 3072, or 4096",
		},
		{
			name: "valid RSA 3072",
			config: &Config{
				DefaultValidityDays: 365,
				RootCAValidityDays:  3650,
				IntCAValidityDays:   1825,
				DefaultKeyType:      "rsa",
				DefaultKeySize:      3072,
			},
			wantErr: false,
		},
		{
			name: "valid RSA 4096",
			config: &Config{
				DefaultValidityDays: 365,
				RootCAValidityDays:  3650,
				IntCAValidityDays:   1825,
				DefaultKeyType:      "rsa",
				DefaultKeySize:      4096,
			},
			wantErr: false,
		},
		{
			name: "invalid ECDSA key size",
			config: &Config{
				DefaultValidityDays: 365,
				RootCAValidityDays:  3650,
				IntCAValidityDays:   1825,
				DefaultKeyType:      "ecdsa",
				DefaultKeySize:      128,
			},
			wantErr: true,
			errMsg:  "default_key_size for ECDSA must be 256, 384, or 521",
		},
		{
			name: "valid ECDSA 256",
			config: &Config{
				DefaultValidityDays: 365,
				RootCAValidityDays:  3650,
				IntCAValidityDays:   1825,
				DefaultKeyType:      "ecdsa",
				DefaultKeySize:      256,
			},
			wantErr: false,
		},
		{
			name: "valid ECDSA 384",
			config: &Config{
				DefaultValidityDays: 365,
				RootCAValidityDays:  3650,
				IntCAValidityDays:   1825,
				DefaultKeyType:      "ecdsa",
				DefaultKeySize:      384,
			},
			wantErr: false,
		},
		{
			name: "valid ECDSA 521",
			config: &Config{
				DefaultValidityDays: 365,
				RootCAValidityDays:  3650,
				IntCAValidityDays:   1825,
				DefaultKeyType:      "ecdsa",
				DefaultKeySize:      521,
			},
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateConfig(tt.config)
			if tt.wantErr {
				if err == nil {
					t.Errorf("Expected error containing '%s', got nil", tt.errMsg)
				} else if tt.errMsg != "" && !strings.Contains(err.Error(), tt.errMsg) {
					t.Errorf("Expected error containing '%s', got '%s'", tt.errMsg, err.Error())
				}
			} else {
				if err != nil {
					t.Errorf("Expected no error, got %v", err)
				}
			}
		})
	}
}

func TestLoadConfigWithValidation(t *testing.T) {
	// Create temp directory
	tmpDir := t.TempDir()
	customCADir = tmpDir
	defer func() { customCADir = "" }()

	tests := []struct {
		name       string
		configYAML string
		wantErr    bool
		errMsg     string
	}{
		{
			name: "valid config file",
			configYAML: `default_validity_days: 730
root_ca_validity_days: 3650
intermediate_ca_validity_days: 1825
default_key_type: rsa
default_key_size: 4096`,
			wantErr: false,
		},
		{
			name: "invalid negative validity",
			configYAML: `default_validity_days: -100
root_ca_validity_days: 3650
intermediate_ca_validity_days: 1825
default_key_type: rsa
default_key_size: 2048`,
			wantErr: true,
			errMsg:  "default_validity_days must be at least 1",
		},
		{
			name: "invalid key type",
			configYAML: `default_validity_days: 365
root_ca_validity_days: 3650
intermediate_ca_validity_days: 1825
default_key_type: dsa
default_key_size: 2048`,
			wantErr: true,
			errMsg:  "default_key_type must be 'rsa' or 'ecdsa'",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Write config file
			configPath := filepath.Join(tmpDir, "config.yml")
			if err := os.WriteFile(configPath, []byte(tt.configYAML), 0644); err != nil {
				t.Fatalf("Failed to write config: %v", err)
			}

			// Load config
			cfg, err := loadConfig()

			if tt.wantErr {
				if err == nil {
					t.Errorf("Expected error containing '%s', got nil", tt.errMsg)
				} else if tt.errMsg != "" && !strings.Contains(err.Error(), tt.errMsg) {
					t.Errorf("Expected error containing '%s', got '%s'", tt.errMsg, err.Error())
				}
			} else {
				if err != nil {
					t.Errorf("Expected no error, got %v", err)
				}
				if cfg == nil {
					t.Error("Expected config to be loaded")
				}
			}

			// Clean up for next test
			os.Remove(configPath)
		})
	}
}

func TestSaveConfigWithValidation(t *testing.T) {
	// Create temp directory
	tmpDir := t.TempDir()
	customCADir = tmpDir
	defer func() { customCADir = "" }()

	t.Run("valid config can be saved", func(t *testing.T) {
		cfg := DefaultConfig()
		if err := saveConfig(cfg); err != nil {
			t.Fatalf("Failed to save valid config: %v", err)
		}
	})

	t.Run("invalid config cannot be saved", func(t *testing.T) {
		cfg := &Config{
			DefaultValidityDays: -365,
			RootCAValidityDays:  3650,
			IntCAValidityDays:   1825,
			DefaultKeyType:      "rsa",
			DefaultKeySize:      2048,
		}
		err := saveConfig(cfg)
		if err == nil {
			t.Error("Expected error when saving invalid config, got nil")
		}
		if !strings.Contains(err.Error(), "default_validity_days must be at least 1") {
			t.Errorf("Expected validation error, got %v", err)
		}
	})
}
