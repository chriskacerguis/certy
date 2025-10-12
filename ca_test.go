package main

import (
	"crypto/x509"
	"encoding/pem"
	"os"
	"path/filepath"
	"testing"
)

func TestInstallCA(t *testing.T) {
	// Create temp directory
	tmpDir := t.TempDir()
	customCADir = tmpDir
	defer func() { customCADir = "" }()

	// Install CA
	if err := installCA(); err != nil {
		t.Fatalf("Failed to install CA: %v", err)
	}

	// Verify all files were created
	requiredFiles := []string{
		"rootCA.pem",
		"rootCA-key.pem",
		"intermediateCA.pem",
		"intermediateCA-key.pem",
		"config.yml",
		"serial.txt",
	}

	for _, file := range requiredFiles {
		path := filepath.Join(tmpDir, file)
		if _, err := os.Stat(path); os.IsNotExist(err) {
			t.Errorf("File %s was not created", file)
		}
	}

	// Verify serial number is initialized
	serialData, err := os.ReadFile(filepath.Join(tmpDir, "serial.txt"))
	if err != nil {
		t.Fatalf("Failed to read serial.txt: %v", err)
	}
	if string(serialData) != "1" {
		t.Errorf("Expected serial to be '1', got '%s'", string(serialData))
	}
}

func TestGenerateRootCA(t *testing.T) {
	cfg := DefaultConfig()

	privateKey, cert, err := generateRootCA(cfg)
	if err != nil {
		t.Fatalf("Failed to generate root CA: %v", err)
	}

	// Verify key
	if privateKey == nil {
		t.Fatal("Private key is nil")
	}
	if privateKey.N.BitLen() != cfg.DefaultKeySize {
		t.Errorf("Expected key size %d, got %d", cfg.DefaultKeySize, privateKey.N.BitLen())
	}

	// Verify certificate
	if cert == nil {
		t.Fatal("Certificate is nil")
	}
	if cert.Subject.CommonName != "Certy Root CA" {
		t.Errorf("Expected CN 'Certy Root CA', got '%s'", cert.Subject.CommonName)
	}
	if !cert.IsCA {
		t.Error("Certificate should be a CA")
	}
	if cert.MaxPathLen != 1 {
		t.Errorf("Expected MaxPathLen 1, got %d", cert.MaxPathLen)
	}

	// Verify it's self-signed
	if err := cert.CheckSignatureFrom(cert); err != nil {
		t.Errorf("Certificate is not properly self-signed: %v", err)
	}

	// Verify key usage
	if cert.KeyUsage&x509.KeyUsageCertSign == 0 {
		t.Error("Missing KeyUsageCertSign")
	}
	if cert.KeyUsage&x509.KeyUsageCRLSign == 0 {
		t.Error("Missing KeyUsageCRLSign")
	}
}

func TestGenerateIntermediateCA(t *testing.T) {
	cfg := DefaultConfig()

	// Generate root CA first
	rootKey, rootCert, err := generateRootCA(cfg)
	if err != nil {
		t.Fatalf("Failed to generate root CA: %v", err)
	}

	// Generate intermediate CA
	intKey, intCert, err := generateIntermediateCA(rootKey, rootCert, cfg)
	if err != nil {
		t.Fatalf("Failed to generate intermediate CA: %v", err)
	}

	// Verify key
	if intKey == nil {
		t.Fatal("Private key is nil")
	}

	// Verify certificate
	if intCert == nil {
		t.Fatal("Certificate is nil")
	}
	if intCert.Subject.CommonName != "Certy Intermediate CA" {
		t.Errorf("Expected CN 'Certy Intermediate CA', got '%s'", intCert.Subject.CommonName)
	}
	if !intCert.IsCA {
		t.Error("Certificate should be a CA")
	}
	if intCert.MaxPathLen != 0 || !intCert.MaxPathLenZero {
		t.Error("Intermediate CA should have MaxPathLen of 0")
	}

	// Verify it's signed by root CA
	if err := intCert.CheckSignatureFrom(rootCert); err != nil {
		t.Errorf("Certificate is not properly signed by root CA: %v", err)
	}

	// Verify key usage
	if intCert.KeyUsage&x509.KeyUsageCertSign == 0 {
		t.Error("Missing KeyUsageCertSign")
	}
	if intCert.KeyUsage&x509.KeyUsageCRLSign == 0 {
		t.Error("Missing KeyUsageCRLSign")
	}
}

func TestSaveAndLoadCA(t *testing.T) {
	// Create temp directory
	tmpDir := t.TempDir()
	customCADir = tmpDir
	defer func() { customCADir = "" }()

	cfg := DefaultConfig()

	// Generate root CA
	rootKey, rootCert, err := generateRootCA(cfg)
	if err != nil {
		t.Fatalf("Failed to generate root CA: %v", err)
	}

	// Save root CA
	if err := saveKeyAndCert(rootKey, rootCert, "rootCA"); err != nil {
		t.Fatalf("Failed to save root CA: %v", err)
	}

	// Verify files exist
	keyPath := filepath.Join(tmpDir, "rootCA-key.pem")
	certPath := filepath.Join(tmpDir, "rootCA.pem")

	if _, err := os.Stat(keyPath); os.IsNotExist(err) {
		t.Error("Key file was not created")
	}
	if _, err := os.Stat(certPath); os.IsNotExist(err) {
		t.Error("Certificate file was not created")
	}

	// Load and verify key
	keyData, err := os.ReadFile(keyPath)
	if err != nil {
		t.Fatalf("Failed to read key: %v", err)
	}

	keyBlock, _ := pem.Decode(keyData)
	if keyBlock == nil {
		t.Fatal("Failed to decode key PEM")
	}
	if keyBlock.Type != "RSA PRIVATE KEY" {
		t.Errorf("Expected RSA PRIVATE KEY, got %s", keyBlock.Type)
	}

	loadedKey, err := x509.ParsePKCS1PrivateKey(keyBlock.Bytes)
	if err != nil {
		t.Fatalf("Failed to parse key: %v", err)
	}

	if loadedKey.N.Cmp(rootKey.N) != 0 {
		t.Error("Loaded key does not match original")
	}

	// Load and verify certificate
	certData, err := os.ReadFile(certPath)
	if err != nil {
		t.Fatalf("Failed to read certificate: %v", err)
	}

	certBlock, _ := pem.Decode(certData)
	if certBlock == nil {
		t.Fatal("Failed to decode certificate PEM")
	}
	if certBlock.Type != "CERTIFICATE" {
		t.Errorf("Expected CERTIFICATE, got %s", certBlock.Type)
	}

	loadedCert, err := x509.ParseCertificate(certBlock.Bytes)
	if err != nil {
		t.Fatalf("Failed to parse certificate: %v", err)
	}

	if loadedCert.Subject.CommonName != rootCert.Subject.CommonName {
		t.Error("Loaded certificate does not match original")
	}
}

func TestLoadIntermediateCA(t *testing.T) {
	// Create temp directory
	tmpDir := t.TempDir()
	customCADir = tmpDir
	defer func() { customCADir = "" }()

	// Install CA
	if err := installCA(); err != nil {
		t.Fatalf("Failed to install CA: %v", err)
	}

	// Load intermediate CA
	intKey, intCert, err := loadIntermediateCA()
	if err != nil {
		t.Fatalf("Failed to load intermediate CA: %v", err)
	}

	// Verify
	if intKey == nil {
		t.Fatal("Private key is nil")
	}
	if intCert == nil {
		t.Fatal("Certificate is nil")
	}
	if intCert.Subject.CommonName != "Certy Intermediate CA" {
		t.Errorf("Expected CN 'Certy Intermediate CA', got '%s'", intCert.Subject.CommonName)
	}
}

func TestCertificateChainValidity(t *testing.T) {
	// Create temp directory
	tmpDir := t.TempDir()
	customCADir = tmpDir
	defer func() { customCADir = "" }()

	// Install CA
	if err := installCA(); err != nil {
		t.Fatalf("Failed to install CA: %v", err)
	}

	// Load root CA
	rootCertPath := filepath.Join(tmpDir, "rootCA.pem")
	rootCertData, err := os.ReadFile(rootCertPath)
	if err != nil {
		t.Fatalf("Failed to read root CA: %v", err)
	}

	rootBlock, _ := pem.Decode(rootCertData)
	rootCert, err := x509.ParseCertificate(rootBlock.Bytes)
	if err != nil {
		t.Fatalf("Failed to parse root CA: %v", err)
	}

	// Load intermediate CA
	intCertPath := filepath.Join(tmpDir, "intermediateCA.pem")
	intCertData, err := os.ReadFile(intCertPath)
	if err != nil {
		t.Fatalf("Failed to read intermediate CA: %v", err)
	}

	intBlock, _ := pem.Decode(intCertData)
	intCert, err := x509.ParseCertificate(intBlock.Bytes)
	if err != nil {
		t.Fatalf("Failed to parse intermediate CA: %v", err)
	}

	// Verify chain
	// 1. Intermediate signed by root
	if err := intCert.CheckSignatureFrom(rootCert); err != nil {
		t.Errorf("Intermediate CA not properly signed by root CA: %v", err)
	}

	// 2. Root is self-signed
	if err := rootCert.CheckSignatureFrom(rootCert); err != nil {
		t.Errorf("Root CA not properly self-signed: %v", err)
	}

	// 3. Generate end-entity certificate
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

	// Load end-entity cert
	endCertData, err := os.ReadFile(certPath)
	if err != nil {
		t.Fatalf("Failed to read end-entity cert: %v", err)
	}

	endBlock, _ := pem.Decode(endCertData)
	endCert, err := x509.ParseCertificate(endBlock.Bytes)
	if err != nil {
		t.Fatalf("Failed to parse end-entity cert: %v", err)
	}

	// 4. End-entity signed by intermediate
	if err := endCert.CheckSignatureFrom(intCert); err != nil {
		t.Errorf("End-entity cert not properly signed by intermediate CA: %v", err)
	}

	// 5. Verify using crypto/x509 certificate pools
	roots := x509.NewCertPool()
	roots.AddCert(rootCert)

	intermediates := x509.NewCertPool()
	intermediates.AddCert(intCert)

	opts := x509.VerifyOptions{
		Roots:         roots,
		Intermediates: intermediates,
		DNSName:       "example.com",
	}

	if _, err := endCert.Verify(opts); err != nil {
		t.Errorf("Certificate chain verification failed: %v", err)
	}
}

func TestKeyFilePermissions(t *testing.T) {
	// Create temp directory
	tmpDir := t.TempDir()
	customCADir = tmpDir
	defer func() { customCADir = "" }()

	cfg := DefaultConfig()

	// Generate root CA
	rootKey, rootCert, err := generateRootCA(cfg)
	if err != nil {
		t.Fatalf("Failed to generate root CA: %v", err)
	}

	// Save root CA
	if err := saveKeyAndCert(rootKey, rootCert, "rootCA"); err != nil {
		t.Fatalf("Failed to save root CA: %v", err)
	}

	// Check key file permissions
	keyPath := filepath.Join(tmpDir, "rootCA-key.pem")
	info, err := os.Stat(keyPath)
	if err != nil {
		t.Fatalf("Failed to stat key file: %v", err)
	}

	mode := info.Mode().Perm()
	expected := os.FileMode(0600)
	if mode != expected {
		t.Errorf("Expected key file permissions %v, got %v", expected, mode)
	}
}
