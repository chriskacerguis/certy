package main

import (
	"crypto/x509"
	"os"
	"path/filepath"
	"testing"

	"software.sslmate.com/src/go-pkcs12"
)

func TestGeneratePKCS12(t *testing.T) {
	// Create temp directory
	tmpDir := t.TempDir()
	customCADir = tmpDir
	defer func() { customCADir = "" }()

	// Install CA
	if err := installCA(); err != nil {
		t.Fatalf("Failed to install CA: %v", err)
	}

	// Generate certificate
	cfg, _ := loadConfig()
	certPath, keyPath, err := generateCertificate(
		[]string{"example.com"},
		CertTypeTLS,
		false,
		"",
		"",
		cfg,
	)
	if err != nil {
		t.Fatalf("Failed to generate certificate: %v", err)
	}
	defer os.Remove(certPath)
	defer os.Remove(keyPath)

	// Generate PKCS#12
	p12Path := filepath.Join(tmpDir, "test.p12")
	if err := generatePKCS12(certPath, keyPath, p12Path); err != nil {
		t.Fatalf("Failed to generate PKCS#12: %v", err)
	}
	defer os.Remove(p12Path)

	// Verify file exists
	if _, err := os.Stat(p12Path); os.IsNotExist(err) {
		t.Error("PKCS#12 file was not created")
	}

	// Load and verify PKCS#12 file
	p12Data, err := os.ReadFile(p12Path)
	if err != nil {
		t.Fatalf("Failed to read PKCS#12 file: %v", err)
	}

	// Decode PKCS#12 with empty password
	privateKey, cert, caCerts, err := pkcs12.DecodeChain(p12Data, "")
	if err != nil {
		t.Fatalf("Failed to decode PKCS#12: %v", err)
	}

	// Verify private key
	if privateKey == nil {
		t.Error("Private key is nil")
	}

	// Verify certificate
	if cert == nil {
		t.Fatal("Certificate is nil")
	}
	if cert.Subject.CommonName != "example.com" {
		t.Errorf("Expected CN 'example.com', got '%s'", cert.Subject.CommonName)
	}

	// Verify CA chain
	if len(caCerts) < 1 {
		t.Error("Expected at least 1 CA certificate in chain")
	}

	// Verify intermediate CA is in chain
	found := false
	for _, ca := range caCerts {
		if ca.Subject.CommonName == "Certy Intermediate CA" {
			found = true
			break
		}
	}
	if !found {
		t.Error("Intermediate CA not found in PKCS#12 chain")
	}
}

func TestGeneratePKCS12WithECDSA(t *testing.T) {
	// Create temp directory
	tmpDir := t.TempDir()
	customCADir = tmpDir
	defer func() { customCADir = "" }()

	// Install CA
	if err := installCA(); err != nil {
		t.Fatalf("Failed to install CA: %v", err)
	}

	// Generate ECDSA certificate
	cfg, _ := loadConfig()
	certPath, keyPath, err := generateCertificate(
		[]string{"example.com"},
		CertTypeTLS,
		true, // Use ECDSA
		"",
		"",
		cfg,
	)
	if err != nil {
		t.Fatalf("Failed to generate certificate: %v", err)
	}
	defer os.Remove(certPath)
	defer os.Remove(keyPath)

	// Generate PKCS#12
	p12Path := filepath.Join(tmpDir, "test-ecdsa.p12")
	if err := generatePKCS12(certPath, keyPath, p12Path); err != nil {
		t.Fatalf("Failed to generate PKCS#12: %v", err)
	}
	defer os.Remove(p12Path)

	// Verify file exists
	if _, err := os.Stat(p12Path); os.IsNotExist(err) {
		t.Error("PKCS#12 file was not created")
	}

	// Load and verify PKCS#12 file
	p12Data, err := os.ReadFile(p12Path)
	if err != nil {
		t.Fatalf("Failed to read PKCS#12 file: %v", err)
	}

	// Decode PKCS#12 with empty password
	privateKey, cert, _, err := pkcs12.DecodeChain(p12Data, "")
	if err != nil {
		t.Fatalf("Failed to decode PKCS#12: %v", err)
	}

	// Verify private key is ECDSA
	if privateKey == nil {
		t.Fatal("Private key is nil")
	}

	// Verify certificate uses ECDSA
	if cert.PublicKeyAlgorithm != x509.ECDSA {
		t.Errorf("Expected ECDSA public key algorithm, got %v", cert.PublicKeyAlgorithm)
	}
}

func TestPKCS12FilePermissions(t *testing.T) {
	// Create temp directory
	tmpDir := t.TempDir()
	customCADir = tmpDir
	defer func() { customCADir = "" }()

	// Install CA
	if err := installCA(); err != nil {
		t.Fatalf("Failed to install CA: %v", err)
	}

	// Generate certificate
	cfg, _ := loadConfig()
	certPath, keyPath, err := generateCertificate(
		[]string{"example.com"},
		CertTypeTLS,
		false,
		"",
		"",
		cfg,
	)
	if err != nil {
		t.Fatalf("Failed to generate certificate: %v", err)
	}
	defer os.Remove(certPath)
	defer os.Remove(keyPath)

	// Generate PKCS#12
	p12Path := filepath.Join(tmpDir, "test.p12")
	if err := generatePKCS12(certPath, keyPath, p12Path); err != nil {
		t.Fatalf("Failed to generate PKCS#12: %v", err)
	}
	defer os.Remove(p12Path)

	// Check file permissions
	info, err := os.Stat(p12Path)
	if err != nil {
		t.Fatalf("Failed to stat PKCS#12 file: %v", err)
	}

	mode := info.Mode().Perm()
	expected := os.FileMode(0600)
	if mode != expected {
		t.Errorf("Expected PKCS#12 file permissions %v, got %v", expected, mode)
	}
}
