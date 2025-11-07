package main

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"fmt"
	"math/big"
	"os"
	"time"
)

// installCA creates the root CA and intermediate CA infrastructure
func installCA() error {
	// Ensure certy directory exists
	dir, err := getCertyDir()
	if err != nil {
		return err
	}

	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("failed to create certy directory: %w", err)
	}

	// Load existing config if present, otherwise use defaults
	cfg, err := loadConfig()
	if err != nil {
		// If config doesn't exist, use defaults
		cfg = DefaultConfig()
	}

	// Save config to ensure it exists
	if err := saveConfig(cfg); err != nil {
		return fmt.Errorf("failed to save config: %w", err)
	}

	// Generate root CA
	fmt.Println("Generating root CA...")
	rootKey, rootCert, err := generateRootCA(cfg)
	if err != nil {
		return fmt.Errorf("failed to generate root CA: %w", err)
	}

	// Save root CA
	if err := saveKeyAndCert(rootKey, rootCert, "rootCA"); err != nil {
		return fmt.Errorf("failed to save root CA: %w", err)
	}

	// Generate intermediate CA
	fmt.Println("Generating intermediate CA...")
	intKey, intCert, err := generateIntermediateCA(rootKey, rootCert, cfg)
	if err != nil {
		return fmt.Errorf("failed to generate intermediate CA: %w", err)
	}

	// Save intermediate CA
	if err := saveKeyAndCert(intKey, intCert, "intermediateCA"); err != nil {
		return fmt.Errorf("failed to save intermediate CA: %w", err)
	}

	// Initialize serial number file
	serialPath, err := getCAFilePath("serial.txt")
	if err != nil {
		return err
	}
	if err := os.WriteFile(serialPath, []byte("1"), 0644); err != nil {
		return fmt.Errorf("failed to initialize serial file: %w", err)
	}

	return nil
}

// generateRootCA generates a self-signed root CA certificate
func generateRootCA(cfg *Config) (*rsa.PrivateKey, *x509.Certificate, error) {
	// Generate private key
	privateKey, err := rsa.GenerateKey(rand.Reader, cfg.DefaultKeySize)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to generate private key: %w", err)
	}

	// Create certificate template
	serialNumber, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		return nil, nil, fmt.Errorf("failed to generate serial number: %w", err)
	}

	template := &x509.Certificate{
		SerialNumber: serialNumber,
		Subject: pkix.Name{
			CommonName:   "Certy Root CA",
			Organization: []string{"Certy"},
		},
		NotBefore:             time.Now().AddDate(0, 0, -1),
		NotAfter:              time.Now().AddDate(0, 0, cfg.RootCAValidityDays),
		KeyUsage:              x509.KeyUsageCertSign | x509.KeyUsageCRLSign,
		BasicConstraintsValid: true,
		IsCA:                  true,
		MaxPathLen:            1,
		MaxPathLenZero:        false,
	}

	// Create self-signed certificate
	certDER, err := x509.CreateCertificate(rand.Reader, template, template, &privateKey.PublicKey, privateKey)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to create certificate: %w", err)
	}

	// Parse certificate
	cert, err := x509.ParseCertificate(certDER)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to parse certificate: %w", err)
	}

	return privateKey, cert, nil
}

// generateIntermediateCA generates an intermediate CA certificate signed by the root CA
func generateIntermediateCA(rootKey *rsa.PrivateKey, rootCert *x509.Certificate, cfg *Config) (*rsa.PrivateKey, *x509.Certificate, error) {
	// Generate private key
	privateKey, err := rsa.GenerateKey(rand.Reader, cfg.DefaultKeySize)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to generate private key: %w", err)
	}

	// Create certificate template
	serialNumber, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		return nil, nil, fmt.Errorf("failed to generate serial number: %w", err)
	}

	template := &x509.Certificate{
		SerialNumber: serialNumber,
		Subject: pkix.Name{
			CommonName:   "Certy Intermediate CA",
			Organization: []string{"Certy"},
		},
		NotBefore:             time.Now().AddDate(0, 0, -1),
		NotAfter:              time.Now().AddDate(0, 0, cfg.IntCAValidityDays),
		KeyUsage:              x509.KeyUsageCertSign | x509.KeyUsageCRLSign,
		BasicConstraintsValid: true,
		IsCA:                  true,
		MaxPathLen:            0,
		MaxPathLenZero:        true,
	}

	// Add CRL distribution point if configured
	if cfg.CRLURL != "" {
		template.CRLDistributionPoints = []string{cfg.CRLURL}
	}

	// Create certificate signed by root CA
	certDER, err := x509.CreateCertificate(rand.Reader, template, rootCert, &privateKey.PublicKey, rootKey)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to create certificate: %w", err)
	}

	// Parse certificate
	cert, err := x509.ParseCertificate(certDER)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to parse certificate: %w", err)
	}

	return privateKey, cert, nil
}

// saveKeyAndCert saves a private key and certificate to PEM files
func saveKeyAndCert(key *rsa.PrivateKey, cert *x509.Certificate, baseName string) error {
	// Save private key
	keyPath, err := getCAFilePath(baseName + "-key.pem")
	if err != nil {
		return err
	}

	keyFile, err := os.OpenFile(keyPath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0600)
	if err != nil {
		return fmt.Errorf("failed to create key file: %w", err)
	}
	defer keyFile.Close()

	keyPEM := &pem.Block{
		Type:  "RSA PRIVATE KEY",
		Bytes: x509.MarshalPKCS1PrivateKey(key),
	}
	if err := pem.Encode(keyFile, keyPEM); err != nil {
		return fmt.Errorf("failed to write key file: %w", err)
	}

	// Save certificate
	certPath, err := getCAFilePath(baseName + ".pem")
	if err != nil {
		return err
	}

	certFile, err := os.Create(certPath)
	if err != nil {
		return fmt.Errorf("failed to create certificate file: %w", err)
	}
	defer certFile.Close()

	certPEM := &pem.Block{
		Type:  "CERTIFICATE",
		Bytes: cert.Raw,
	}
	if err := pem.Encode(certFile, certPEM); err != nil {
		return fmt.Errorf("failed to write certificate file: %w", err)
	}

	return nil
}

// loadIntermediateCA loads the intermediate CA key and certificate
func loadIntermediateCA() (*rsa.PrivateKey, *x509.Certificate, error) {
	// Load private key
	keyPath, err := getCAFilePath("intermediateCA-key.pem")
	if err != nil {
		return nil, nil, err
	}

	keyData, err := os.ReadFile(keyPath)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to read intermediate CA key: %w", err)
	}

	keyBlock, _ := pem.Decode(keyData)
	if keyBlock == nil {
		return nil, nil, fmt.Errorf("failed to decode intermediate CA key PEM")
	}

	privateKey, err := x509.ParsePKCS1PrivateKey(keyBlock.Bytes)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to parse intermediate CA key: %w", err)
	}

	// Load certificate
	certPath, err := getCAFilePath("intermediateCA.pem")
	if err != nil {
		return nil, nil, err
	}

	certData, err := os.ReadFile(certPath)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to read intermediate CA certificate: %w", err)
	}

	certBlock, _ := pem.Decode(certData)
	if certBlock == nil {
		return nil, nil, fmt.Errorf("failed to decode intermediate CA certificate PEM")
	}

	cert, err := x509.ParseCertificate(certBlock.Bytes)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to parse intermediate CA certificate: %w", err)
	}

	return privateKey, cert, nil
}
