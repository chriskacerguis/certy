package main

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"net"
	"os"
	"path/filepath"
	"testing"
)

func TestGenerateFromCSR(t *testing.T) {
	// Create temp directory
	tmpDir := t.TempDir()
	customCADir = tmpDir
	defer func() { customCADir = "" }()

	// Install CA
	if err := installCA(); err != nil {
		t.Fatalf("Failed to install CA: %v", err)
	}

	// Generate a CSR
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("Failed to generate key: %v", err)
	}

	csrTemplate := &x509.CertificateRequest{
		Subject: pkix.Name{
			CommonName: "test.example.com",
		},
		DNSNames: []string{"test.example.com", "*.test.example.com"},
	}

	csrDER, err := x509.CreateCertificateRequest(rand.Reader, csrTemplate, privateKey)
	if err != nil {
		t.Fatalf("Failed to create CSR: %v", err)
	}

	// Save CSR to file
	csrPath := filepath.Join(tmpDir, "test.csr")
	csrFile, err := os.Create(csrPath)
	if err != nil {
		t.Fatalf("Failed to create CSR file: %v", err)
	}

	csrPEM := &pem.Block{
		Type:  "CERTIFICATE REQUEST",
		Bytes: csrDER,
	}
	if err := pem.Encode(csrFile, csrPEM); err != nil {
		csrFile.Close()
		t.Fatalf("Failed to write CSR: %v", err)
	}
	csrFile.Close()

	// Generate certificate from CSR
	cfg, _ := loadConfig()
	certPath, err := generateFromCSR(csrPath, "", cfg)
	if err != nil {
		t.Fatalf("Failed to generate certificate from CSR: %v", err)
	}
	defer os.Remove(certPath)

	// Verify certificate
	certData, err := os.ReadFile(certPath)
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

	// Verify properties
	if cert.Subject.CommonName != "test.example.com" {
		t.Errorf("Expected CN 'test.example.com', got '%s'", cert.Subject.CommonName)
	}

	if len(cert.DNSNames) != 2 {
		t.Errorf("Expected 2 DNS names, got %d", len(cert.DNSNames))
	}

	// Verify certificate was signed by intermediate CA
	_, intCert, err := loadIntermediateCA()
	if err != nil {
		t.Fatalf("Failed to load intermediate CA: %v", err)
	}

	if err := cert.CheckSignatureFrom(intCert); err != nil {
		t.Errorf("Certificate not properly signed by intermediate CA: %v", err)
	}
}

func TestGenerateFromCSRWithCustomOutputPath(t *testing.T) {
	// Create temp directory
	tmpDir := t.TempDir()
	customCADir = tmpDir
	defer func() { customCADir = "" }()

	// Install CA
	if err := installCA(); err != nil {
		t.Fatalf("Failed to install CA: %v", err)
	}

	// Generate a minimal CSR
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("Failed to generate key: %v", err)
	}

	csrTemplate := &x509.CertificateRequest{
		Subject: pkix.Name{
			CommonName: "custom.example.com",
		},
	}

	csrDER, err := x509.CreateCertificateRequest(rand.Reader, csrTemplate, privateKey)
	if err != nil {
		t.Fatalf("Failed to create CSR: %v", err)
	}

	// Save CSR to file
	csrPath := filepath.Join(tmpDir, "custom.csr")
	csrFile, err := os.Create(csrPath)
	if err != nil {
		t.Fatalf("Failed to create CSR file: %v", err)
	}

	csrPEM := &pem.Block{
		Type:  "CERTIFICATE REQUEST",
		Bytes: csrDER,
	}
	if err := pem.Encode(csrFile, csrPEM); err != nil {
		csrFile.Close()
		t.Fatalf("Failed to encode CSR: %v", err)
	}
	csrFile.Close()

	// Generate certificate with custom output path
	customCertPath := filepath.Join(tmpDir, "custom-cert.pem")
	cfg, _ := loadConfig()
	certPath, err := generateFromCSR(csrPath, customCertPath, cfg)
	if err != nil {
		t.Fatalf("Failed to generate certificate from CSR: %v", err)
	}
	defer os.Remove(certPath)

	// Verify custom path was used
	if certPath != customCertPath {
		t.Errorf("Expected cert path %s, got %s", customCertPath, certPath)
	}

	// Verify file exists
	if _, err := os.Stat(customCertPath); os.IsNotExist(err) {
		t.Error("Certificate file was not created at custom path")
	}
}

func TestGenerateFromCSRWithInvalidCSR(t *testing.T) {
	// Create temp directory
	tmpDir := t.TempDir()
	customCADir = tmpDir
	defer func() { customCADir = "" }()

	// Install CA
	if err := installCA(); err != nil {
		t.Fatalf("Failed to install CA: %v", err)
	}

	// Create invalid CSR file
	csrPath := filepath.Join(tmpDir, "invalid.csr")
	if err := os.WriteFile(csrPath, []byte("invalid csr data"), 0644); err != nil {
		t.Fatalf("Failed to create invalid CSR: %v", err)
	}

	// Try to generate certificate
	cfg, _ := loadConfig()
	_, err := generateFromCSR(csrPath, "", cfg)
	if err == nil {
		t.Error("Expected error for invalid CSR, got nil")
	}
}

func TestGenerateFromCSRWithIPsAndEmails(t *testing.T) {
	// Create temp directory
	tmpDir := t.TempDir()
	customCADir = tmpDir
	defer func() { customCADir = "" }()

	// Install CA
	if err := installCA(); err != nil {
		t.Fatalf("Failed to install CA: %v", err)
	}

	// Generate a CSR with IPs and emails
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("Failed to generate key: %v", err)
	}

	csrTemplate := &x509.CertificateRequest{
		Subject: pkix.Name{
			CommonName: "multi.example.com",
		},
		DNSNames:       []string{"multi.example.com"},
		IPAddresses:    []net.IP{net.ParseIP("127.0.0.1"), net.ParseIP("::1")},
		EmailAddresses: []string{"user@example.com"},
	}

	csrDER, err := x509.CreateCertificateRequest(rand.Reader, csrTemplate, privateKey)
	if err != nil {
		t.Fatalf("Failed to create CSR: %v", err)
	}

	// Save CSR to file
	csrPath := filepath.Join(tmpDir, "multi.csr")
	csrFile, err := os.Create(csrPath)
	if err != nil {
		t.Fatalf("Failed to create CSR file: %v", err)
	}

	csrPEM := &pem.Block{
		Type:  "CERTIFICATE REQUEST",
		Bytes: csrDER,
	}
	if err := pem.Encode(csrFile, csrPEM); err != nil {
		csrFile.Close()
		t.Fatalf("Failed to encode CSR: %v", err)
	}
	csrFile.Close()

	// Generate certificate from CSR
	cfg, _ := loadConfig()
	certPath, err := generateFromCSR(csrPath, "", cfg)
	if err != nil {
		t.Fatalf("Failed to generate certificate from CSR: %v", err)
	}
	defer os.Remove(certPath)

	// Verify certificate
	certData, err := os.ReadFile(certPath)
	if err != nil {
		t.Fatalf("Failed to read certificate: %v", err)
	}

	block, _ := pem.Decode(certData)
	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		t.Fatalf("Failed to parse certificate: %v", err)
	}

	// Verify SANs
	if len(cert.EmailAddresses) != 1 {
		t.Errorf("Expected 1 email address, got %d", len(cert.EmailAddresses))
	}
}
