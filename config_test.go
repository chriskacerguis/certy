package main

import (
	"os"
	"path/filepath"
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
