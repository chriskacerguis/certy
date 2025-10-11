package main

import (
	"crypto/x509"
	"encoding/pem"
	"fmt"
	"os"

	"software.sslmate.com/src/go-pkcs12"
)

// generatePKCS12 generates a PKCS#12 file from a certificate and private key
func generatePKCS12(certPath, keyPath, p12Path string) error {
	// Read certificate
	certData, err := os.ReadFile(certPath)
	if err != nil {
		return fmt.Errorf("failed to read certificate: %w", err)
	}

	certBlock, _ := pem.Decode(certData)
	if certBlock == nil {
		return fmt.Errorf("failed to decode certificate PEM")
	}

	cert, err := x509.ParseCertificate(certBlock.Bytes)
	if err != nil {
		return fmt.Errorf("failed to parse certificate: %w", err)
	}

	// Read private key
	keyData, err := os.ReadFile(keyPath)
	if err != nil {
		return fmt.Errorf("failed to read private key: %w", err)
	}

	keyBlock, _ := pem.Decode(keyData)
	if keyBlock == nil {
		return fmt.Errorf("failed to decode private key PEM")
	}

	var privateKey interface{}
	switch keyBlock.Type {
	case "RSA PRIVATE KEY":
		privateKey, err = x509.ParsePKCS1PrivateKey(keyBlock.Bytes)
		if err != nil {
			return fmt.Errorf("failed to parse RSA private key: %w", err)
		}
	case "EC PRIVATE KEY":
		privateKey, err = x509.ParseECPrivateKey(keyBlock.Bytes)
		if err != nil {
			return fmt.Errorf("failed to parse EC private key: %w", err)
		}
	default:
		return fmt.Errorf("unsupported private key type: %s", keyBlock.Type)
	}

	// Load intermediate CA certificate for the chain
	intCACertPath, err := getCAFilePath("intermediateCA.pem")
	if err != nil {
		return err
	}

	intCACertData, err := os.ReadFile(intCACertPath)
	if err != nil {
		return fmt.Errorf("failed to read intermediate CA certificate: %w", err)
	}

	intCABlock, _ := pem.Decode(intCACertData)
	if intCABlock == nil {
		return fmt.Errorf("failed to decode intermediate CA certificate PEM")
	}

	intCACert, err := x509.ParseCertificate(intCABlock.Bytes)
	if err != nil {
		return fmt.Errorf("failed to parse intermediate CA certificate: %w", err)
	}

	// Create PKCS#12 data with the certificate chain
	// Note: Using empty password for simplicity (no password protection)
	pfxData, err := pkcs12.Modern.Encode(privateKey, cert, []*x509.Certificate{intCACert}, "")
	if err != nil {
		return fmt.Errorf("failed to encode PKCS#12: %w", err)
	}

	// Write PKCS#12 file
	if err := os.WriteFile(p12Path, pfxData, 0600); err != nil {
		return fmt.Errorf("failed to write PKCS#12 file: %w", err)
	}

	return nil
}
