package main

import (
	"crypto/x509"
	"encoding/pem"
	"math/big"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestCRLGeneration(t *testing.T) {
	// Create temporary directory for test
	tmpDir, err := os.MkdirTemp("", "certy-crl-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	// Set custom CA directory
	customCADir = tmpDir

	// Install CA
	if err := installCA(); err != nil {
		t.Fatalf("Failed to install CA: %v", err)
	}

	// Generate CRL (should be empty)
	crlPath := filepath.Join(tmpDir, "test.crl")
	if err := generateCRL(crlPath); err != nil {
		t.Fatalf("Failed to generate CRL: %v", err)
	}

	// Verify CRL file exists
	if _, err := os.Stat(crlPath); os.IsNotExist(err) {
		t.Fatal("CRL file was not created")
	}

	// Parse CRL
	crlData, err := os.ReadFile(crlPath)
	if err != nil {
		t.Fatalf("Failed to read CRL: %v", err)
	}

	block, _ := pem.Decode(crlData)
	if block == nil {
		t.Fatal("Failed to decode CRL PEM")
	}

	crl, err := x509.ParseRevocationList(block.Bytes)
	if err != nil {
		t.Fatalf("Failed to parse CRL: %v", err)
	}

	// Verify CRL properties
	if crl.Issuer.CommonName != "Certy Intermediate CA" {
		t.Errorf("Expected issuer 'Certy Intermediate CA', got '%s'", crl.Issuer.CommonName)
	}

	if len(crl.RevokedCertificateEntries) != 0 {
		t.Errorf("Expected 0 revoked certificates, got %d", len(crl.RevokedCertificateEntries))
	}

	// Verify validity period (30 days)
	expectedNextUpdate := crl.ThisUpdate.AddDate(0, 0, 30)
	if !crl.NextUpdate.Equal(expectedNextUpdate) {
		t.Errorf("Expected NextUpdate %v, got %v", expectedNextUpdate, crl.NextUpdate)
	}
}

func TestCertificateRevocation(t *testing.T) {
	// Create temporary directory for test
	tmpDir, err := os.MkdirTemp("", "certy-crl-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	// Set custom CA directory
	customCADir = tmpDir

	// Install CA
	if err := installCA(); err != nil {
		t.Fatalf("Failed to install CA: %v", err)
	}

	// Revoke a certificate
	testSerial := "12345"
	if err := revokeCertificate(testSerial, 0); err != nil {
		t.Fatalf("Failed to revoke certificate: %v", err)
	}

	// Verify revoked.db file
	revokedPath := filepath.Join(tmpDir, "revoked.db")
	if _, err := os.Stat(revokedPath); os.IsNotExist(err) {
		t.Fatal("revoked.db file was not created")
	}

	// Load and verify revoked certificates
	revoked, err := loadRevokedCertificates()
	if err != nil {
		t.Fatalf("Failed to load revoked certificates: %v", err)
	}

	if len(revoked) != 1 {
		t.Fatalf("Expected 1 revoked certificate, got %d", len(revoked))
	}

	expectedSerial := new(big.Int)
	expectedSerial.SetString(testSerial, 10)

	if revoked[0].SerialNumber.Cmp(expectedSerial) != 0 {
		t.Errorf("Expected serial %s, got %s", testSerial, revoked[0].SerialNumber.String())
	}

	if revoked[0].Reason != 0 {
		t.Errorf("Expected reason 0, got %d", revoked[0].Reason)
	}

	// Verify timestamp is recent (within last minute)
	if time.Since(revoked[0].RevokedAt) > time.Minute {
		t.Errorf("Revocation timestamp is too old: %v", revoked[0].RevokedAt)
	}
}

func TestCRLWithRevokedCertificates(t *testing.T) {
	// Create temporary directory for test
	tmpDir, err := os.MkdirTemp("", "certy-crl-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	// Set custom CA directory
	customCADir = tmpDir

	// Install CA
	if err := installCA(); err != nil {
		t.Fatalf("Failed to install CA: %v", err)
	}

	// Revoke multiple certificates
	serials := []string{"1", "2", "3"}
	for _, serial := range serials {
		if err := revokeCertificate(serial, 0); err != nil {
			t.Fatalf("Failed to revoke certificate %s: %v", serial, err)
		}
	}

	// Generate CRL
	crlPath := filepath.Join(tmpDir, "test.crl")
	if err := generateCRL(crlPath); err != nil {
		t.Fatalf("Failed to generate CRL: %v", err)
	}

	// Parse CRL
	crlData, err := os.ReadFile(crlPath)
	if err != nil {
		t.Fatalf("Failed to read CRL: %v", err)
	}

	block, _ := pem.Decode(crlData)
	if block == nil {
		t.Fatal("Failed to decode CRL PEM")
	}

	crl, err := x509.ParseRevocationList(block.Bytes)
	if err != nil {
		t.Fatalf("Failed to parse CRL: %v", err)
	}

	// Verify all certificates are in CRL
	if len(crl.RevokedCertificateEntries) != len(serials) {
		t.Fatalf("Expected %d revoked certificates, got %d", len(serials), len(crl.RevokedCertificateEntries))
	}

	// Verify serial numbers match
	foundSerials := make(map[string]bool)
	for _, entry := range crl.RevokedCertificateEntries {
		foundSerials[entry.SerialNumber.String()] = true
	}

	for _, serial := range serials {
		if !foundSerials[serial] {
			t.Errorf("Serial %s not found in CRL", serial)
		}
	}
}

func TestRevokeAlreadyRevokedCertificate(t *testing.T) {
	// Create temporary directory for test
	tmpDir, err := os.MkdirTemp("", "certy-crl-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	// Set custom CA directory
	customCADir = tmpDir

	// Install CA
	if err := installCA(); err != nil {
		t.Fatalf("Failed to install CA: %v", err)
	}

	// Revoke a certificate
	testSerial := "12345"
	if err := revokeCertificate(testSerial, 0); err != nil {
		t.Fatalf("Failed to revoke certificate: %v", err)
	}

	// Try to revoke the same certificate again
	err = revokeCertificate(testSerial, 0)
	if err == nil {
		t.Fatal("Expected error when revoking already revoked certificate")
	}

	expectedError := "certificate with serial 12345 is already revoked"
	if err.Error() != expectedError {
		t.Errorf("Expected error '%s', got '%s'", expectedError, err.Error())
	}
}

func TestCRLWithConfiguredURL(t *testing.T) {
	// Create temporary directory for test
	tmpDir, err := os.MkdirTemp("", "certy-crl-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	// Set custom CA directory
	customCADir = tmpDir

	// Create config with CRL URL
	cfg := DefaultConfig()
	cfg.CRLURL = "http://crl.example.com/intermediate.crl"
	if err := saveConfig(cfg); err != nil {
		t.Fatalf("Failed to save config: %v", err)
	}

	// Install CA
	if err := installCA(); err != nil {
		t.Fatalf("Failed to install CA: %v", err)
	}

	// Load intermediate CA and check for CRL distribution point
	intCertPath := filepath.Join(tmpDir, "intermediateCA.pem")
	certData, err := os.ReadFile(intCertPath)
	if err != nil {
		t.Fatalf("Failed to read intermediate CA cert: %v", err)
	}

	block, _ := pem.Decode(certData)
	if block == nil {
		t.Fatal("Failed to decode intermediate CA PEM")
	}

	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		t.Fatalf("Failed to parse intermediate CA cert: %v", err)
	}

	// Verify CRL distribution point
	if len(cert.CRLDistributionPoints) != 1 {
		t.Fatalf("Expected 1 CRL distribution point, got %d", len(cert.CRLDistributionPoints))
	}

	if cert.CRLDistributionPoints[0] != cfg.CRLURL {
		t.Errorf("Expected CRL URL '%s', got '%s'", cfg.CRLURL, cert.CRLDistributionPoints[0])
	}
}

func TestLoadRevokedCertificatesEmptyFile(t *testing.T) {
	// Create temporary directory for test
	tmpDir, err := os.MkdirTemp("", "certy-crl-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	// Set custom CA directory
	customCADir = tmpDir

	// Create empty revoked.db file
	revokedPath := filepath.Join(tmpDir, "revoked.db")
	if err := os.WriteFile(revokedPath, []byte(""), 0644); err != nil {
		t.Fatalf("Failed to create empty revoked.db: %v", err)
	}

	// Load revoked certificates
	revoked, err := loadRevokedCertificates()
	if err != nil {
		t.Fatalf("Failed to load revoked certificates: %v", err)
	}

	if len(revoked) != 0 {
		t.Errorf("Expected 0 revoked certificates from empty file, got %d", len(revoked))
	}
}

func TestLoadRevokedCertificatesNonexistent(t *testing.T) {
	// Create temporary directory for test
	tmpDir, err := os.MkdirTemp("", "certy-crl-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	// Set custom CA directory
	customCADir = tmpDir

	// Load revoked certificates (file doesn't exist)
	revoked, err := loadRevokedCertificates()
	if err != nil {
		t.Fatalf("Failed to load revoked certificates: %v", err)
	}

	if len(revoked) != 0 {
		t.Errorf("Expected 0 revoked certificates from nonexistent file, got %d", len(revoked))
	}
}
