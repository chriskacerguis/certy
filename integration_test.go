package main

import (
	"crypto/x509"
	"encoding/pem"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// Integration tests that test the full workflow end-to-end

func TestIntegration_FullWorkflow(t *testing.T) {
	// Create temp directory
	tmpDir := t.TempDir()
	customCADir = tmpDir
	defer func() { customCADir = "" }()
	
	t.Run("install CA", func(t *testing.T) {
		if err := installCA(); err != nil {
			t.Fatalf("Failed to install CA: %v", err)
		}
		
		if !caExists() {
			t.Error("CA should exist after installation")
		}
	})
	
	t.Run("generate TLS certificate", func(t *testing.T) {
		cfg, _ := loadConfig()
		certPath, keyPath, err := generateCertificate(
			[]string{"example.com", "*.example.com", "127.0.0.1", "::1"},
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
		
		// Verify certificate
		verifyCertificateFile(t, certPath, "example.com")
		verifyKeyFile(t, keyPath, false)
	})
	
	t.Run("generate S/MIME certificate", func(t *testing.T) {
		cfg, _ := loadConfig()
		certPath, keyPath, err := generateCertificate(
			[]string{"user@example.com"},
			CertTypeSMIME,
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
		
		// Verify certificate
		verifyCertificateFile(t, certPath, "user@example.com")
	})
	
	t.Run("generate client auth certificate", func(t *testing.T) {
		cfg, _ := loadConfig()
		certPath, keyPath, err := generateCertificate(
			[]string{"client.example.com"},
			CertTypeClient,
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
		
		// Verify certificate
		verifyCertificateFile(t, certPath, "client.example.com")
	})
	
	t.Run("generate ECDSA certificate", func(t *testing.T) {
		cfg, _ := loadConfig()
		certPath, keyPath, err := generateCertificate(
			[]string{"ecdsa.example.com"},
			CertTypeTLS,
			true,
			"",
			"",
			cfg,
		)
		if err != nil {
			t.Fatalf("Failed to generate certificate: %v", err)
		}
		defer os.Remove(certPath)
		defer os.Remove(keyPath)
		
		// Verify certificate uses ECDSA
		verifyKeyFile(t, keyPath, true)
	})
	
	t.Run("generate PKCS#12", func(t *testing.T) {
		cfg, _ := loadConfig()
		certPath, keyPath, err := generateCertificate(
			[]string{"pkcs12.example.com"},
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
		
		p12Path := filepath.Join(tmpDir, "test.p12")
		if err := generatePKCS12(certPath, keyPath, p12Path); err != nil {
			t.Fatalf("Failed to generate PKCS#12: %v", err)
		}
		defer os.Remove(p12Path)
		
		// Verify PKCS#12 file exists
		if _, err := os.Stat(p12Path); os.IsNotExist(err) {
			t.Error("PKCS#12 file was not created")
		}
	})
}

func TestIntegration_CertificateChainValidation(t *testing.T) {
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
	
	// Load all certificates in the chain
	rootCert := loadCertFromFile(t, filepath.Join(tmpDir, "rootCA.pem"))
	intCert := loadCertFromFile(t, filepath.Join(tmpDir, "intermediateCA.pem"))
	endCert := loadCertFromFile(t, certPath)
	
	// Create certificate pools
	roots := x509.NewCertPool()
	roots.AddCert(rootCert)
	
	intermediates := x509.NewCertPool()
	intermediates.AddCert(intCert)
	
	// Verify the chain
	opts := x509.VerifyOptions{
		Roots:         roots,
		Intermediates: intermediates,
		DNSName:       "example.com",
	}
	
	chains, err := endCert.Verify(opts)
	if err != nil {
		t.Fatalf("Certificate chain verification failed: %v", err)
	}
	
	// Verify we got a valid chain
	if len(chains) == 0 {
		t.Fatal("No certificate chains returned")
	}
	
	// Verify chain structure: end-entity -> intermediate -> root
	chain := chains[0]
	if len(chain) < 3 {
		t.Errorf("Expected chain length of at least 3, got %d", len(chain))
	}
	
	if chain[0].Subject.CommonName != "example.com" {
		t.Errorf("Expected first cert CN 'example.com', got '%s'", chain[0].Subject.CommonName)
	}
	if chain[1].Subject.CommonName != "Certy Intermediate CA" {
		t.Errorf("Expected second cert CN 'Certy Intermediate CA', got '%s'", chain[1].Subject.CommonName)
	}
	if chain[2].Subject.CommonName != "Certy Root CA" {
		t.Errorf("Expected third cert CN 'Certy Root CA', got '%s'", chain[2].Subject.CommonName)
	}
}

func TestIntegration_SerialNumberIncrement(t *testing.T) {
	// Create temp directory
	tmpDir := t.TempDir()
	customCADir = tmpDir
	defer func() { customCADir = "" }()
	
	// Install CA
	if err := installCA(); err != nil {
		t.Fatalf("Failed to install CA: %v", err)
	}
	
	cfg, _ := loadConfig()
	
	// Generate multiple certificates and track serial numbers
	var serials []int64
	for i := 0; i < 5; i++ {
		// Use simple domain names without paths
		domain := fmt.Sprintf("test%d.example.com", i)
		certPath, keyPath, err := generateCertificate(
			[]string{domain},
			CertTypeTLS,
			false,
			"",
			"",
			cfg,
		)
		if err != nil {
			t.Fatalf("Failed to generate certificate %d: %v", i, err)
		}
		
		// Load certificate and get serial number
		cert := loadCertFromFile(t, certPath)
		serials = append(serials, cert.SerialNumber.Int64())
		
		// Cleanup
		os.Remove(certPath)
		os.Remove(keyPath)
	}
	
	// Verify serial numbers are sequential
	for i := 1; i < len(serials); i++ {
		if serials[i] != serials[i-1]+1 {
			t.Errorf("Serial numbers not sequential: %d -> %d", serials[i-1], serials[i])
		}
	}
}

func TestIntegration_CustomOutputPaths(t *testing.T) {
	// Create temp directory
	tmpDir := t.TempDir()
	customCADir = tmpDir
	defer func() { customCADir = "" }()
	
	// Install CA
	if err := installCA(); err != nil {
		t.Fatalf("Failed to install CA: %v", err)
	}
	
	// Generate certificate with custom paths
	cfg, _ := loadConfig()
	customCertPath := filepath.Join(tmpDir, "custom-cert.pem")
	customKeyPath := filepath.Join(tmpDir, "custom-key.pem")
	
	certPath, keyPath, err := generateCertificate(
		[]string{"example.com"},
		CertTypeTLS,
		false,
		customCertPath,
		customKeyPath,
		cfg,
	)
	if err != nil {
		t.Fatalf("Failed to generate certificate: %v", err)
	}
	defer os.Remove(certPath)
	defer os.Remove(keyPath)
	
	// Verify custom paths were used
	if certPath != customCertPath {
		t.Errorf("Expected cert path %s, got %s", customCertPath, certPath)
	}
	if keyPath != customKeyPath {
		t.Errorf("Expected key path %s, got %s", customKeyPath, keyPath)
	}
	
	// Verify files exist
	if _, err := os.Stat(customCertPath); os.IsNotExist(err) {
		t.Error("Custom cert path file does not exist")
	}
	if _, err := os.Stat(customKeyPath); os.IsNotExist(err) {
		t.Error("Custom key path file does not exist")
	}
}

func TestIntegration_MultipleCADirectories(t *testing.T) {
	// Test that we can use different CA directories
	tmpDir1 := t.TempDir()
	tmpDir2 := t.TempDir()
	
	// Install CA in first directory
	customCADir = tmpDir1
	if err := installCA(); err != nil {
		t.Fatalf("Failed to install CA in dir1: %v", err)
	}
	
	// Install CA in second directory
	customCADir = tmpDir2
	if err := installCA(); err != nil {
		t.Fatalf("Failed to install CA in dir2: %v", err)
	}
	
	// Verify both directories have independent CAs
	customCADir = tmpDir1
	cert1 := loadCertFromFile(t, filepath.Join(tmpDir1, "rootCA.pem"))
	
	customCADir = tmpDir2
	cert2 := loadCertFromFile(t, filepath.Join(tmpDir2, "rootCA.pem"))
	
	// They should have different serial numbers (different CAs)
	if cert1.SerialNumber.Cmp(cert2.SerialNumber) == 0 {
		t.Error("Different CA directories should have different root certificates")
	}
	
	customCADir = ""
}

func TestIntegration_OpenSSLCompatibility(t *testing.T) {
	// Skip if openssl is not available
	if _, err := exec.LookPath("openssl"); err != nil {
		t.Skip("openssl not found in PATH")
	}
	
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
	
	// Verify certificate with OpenSSL
	rootCA := filepath.Join(tmpDir, "rootCA.pem")
	intCA := filepath.Join(tmpDir, "intermediateCA.pem")
	
	cmd := exec.Command("openssl", "verify", "-CAfile", rootCA, "-untrusted", intCA, certPath)
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("OpenSSL verification failed: %v\nOutput: %s", err, string(output))
	}
	
	// Check output contains "OK"
	if !strings.Contains(string(output), "OK") {
		t.Errorf("Expected 'OK' in OpenSSL output, got: %s", string(output))
	}
}

// Helper functions

func verifyCertificateFile(t *testing.T, path, expectedCN string) {
	t.Helper()
	
	// Verify file exists
	if _, err := os.Stat(path); os.IsNotExist(err) {
		t.Fatalf("Certificate file does not exist: %s", path)
	}
	
	// Load certificate
	cert := loadCertFromFile(t, path)
	
	// Verify common name
	if cert.Subject.CommonName != expectedCN {
		t.Errorf("Expected CN '%s', got '%s'", expectedCN, cert.Subject.CommonName)
	}
	
	// Verify it's not a CA
	if cert.IsCA {
		t.Error("End-entity certificate should not be a CA")
	}
}

func verifyKeyFile(t *testing.T, path string, expectECDSA bool) {
	t.Helper()
	
	// Verify file exists
	if _, err := os.Stat(path); os.IsNotExist(err) {
		t.Fatalf("Key file does not exist: %s", path)
	}
	
	// Check file permissions
	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("Failed to stat key file: %v", err)
	}
	
	mode := info.Mode().Perm()
	expected := os.FileMode(0600)
	if mode != expected {
		t.Errorf("Expected key file permissions %v, got %v", expected, mode)
	}
	
	// Load and verify key
	keyData, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("Failed to read key: %v", err)
	}
	
	block, _ := pem.Decode(keyData)
	if block == nil {
		t.Fatal("Failed to decode key PEM")
	}
	
	if expectECDSA {
		if block.Type != "EC PRIVATE KEY" {
			t.Errorf("Expected EC PRIVATE KEY, got %s", block.Type)
		}
	} else {
		if block.Type != "RSA PRIVATE KEY" {
			t.Errorf("Expected RSA PRIVATE KEY, got %s", block.Type)
		}
	}
}

func loadCertFromFile(t *testing.T, path string) *x509.Certificate {
	t.Helper()
	
	certData, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("Failed to read certificate: %v", err)
	}
	
	block, _ := pem.Decode(certData)
	if block == nil {
		t.Fatal("Failed to decode certificate PEM")
	}
	
	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		t.Fatalf("Failed to parse certificate: %v", err)
	}
	
	return cert
}
