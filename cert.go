package main

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"fmt"
	"math/big"
	"net"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// CertificateType represents the type of certificate to generate
type CertificateType int

const (
	CertTypeTLS CertificateType = iota
	CertTypeClient
	CertTypeSMIME
)

// generateCertificate generates a certificate based on the inputs
func generateCertificate(inputs []string, certType CertificateType, useECDSA bool, certFile, keyFile string, cfg *Config) (string, string, error) {
	// Load intermediate CA
	caKey, caCert, err := loadIntermediateCA()
	if err != nil {
		return "", "", err
	}

	// Generate key pair
	var privateKey interface{}
	var publicKey interface{}

	if useECDSA {
		ecdsaKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
		if err != nil {
			return "", "", fmt.Errorf("failed to generate ECDSA key: %w", err)
		}
		privateKey = ecdsaKey
		publicKey = &ecdsaKey.PublicKey
	} else {
		rsaKey, err := rsa.GenerateKey(rand.Reader, cfg.DefaultKeySize)
		if err != nil {
			return "", "", fmt.Errorf("failed to generate RSA key: %w", err)
		}
		privateKey = rsaKey
		publicKey = &rsaKey.PublicKey
	}

	// Get serial number
	serial, err := getSerialNumber()
	if err != nil {
		return "", "", err
	}

	// Parse inputs into SANs
	dnsNames, ipAddresses, emailAddresses := parseInputs(inputs)

	// Determine common name
	commonName := determineCommonName(inputs, certType)

	// Create certificate template
	template := &x509.Certificate{
		SerialNumber: big.NewInt(serial),
		Subject: pkix.Name{
			CommonName: commonName,
		},
		NotBefore:             time.Now(),
		NotAfter:              time.Now().AddDate(0, 0, cfg.DefaultValidityDays),
		DNSNames:              dnsNames,
		IPAddresses:           ipAddresses,
		EmailAddresses:        emailAddresses,
		BasicConstraintsValid: true,
		IsCA:                  false,
	}

	// Set key usage based on certificate type
	switch certType {
	case CertTypeTLS:
		template.KeyUsage = x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment
		template.ExtKeyUsage = []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth}
	case CertTypeClient:
		template.KeyUsage = x509.KeyUsageDigitalSignature
		template.ExtKeyUsage = []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth}
	case CertTypeSMIME:
		template.KeyUsage = x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment
		template.ExtKeyUsage = []x509.ExtKeyUsage{x509.ExtKeyUsageEmailProtection}
	}

	// Create certificate
	certDER, err := x509.CreateCertificate(rand.Reader, template, caCert, publicKey, caKey)
	if err != nil {
		return "", "", fmt.Errorf("failed to create certificate: %w", err)
	}

	// Parse certificate
	cert, err := x509.ParseCertificate(certDER)
	if err != nil {
		return "", "", fmt.Errorf("failed to parse certificate: %w", err)
	}

	// Determine output file paths
	certPath, keyPath := determineOutputPaths(inputs, certFile, keyFile)

	// Save certificate
	if err := saveCertificate(cert, certPath); err != nil {
		return "", "", err
	}

	// Save private key
	if err := savePrivateKey(privateKey, keyPath); err != nil {
		return "", "", err
	}

	return certPath, keyPath, nil
}

// parseInputs parses the inputs into DNS names, IP addresses, and email addresses
func parseInputs(inputs []string) ([]string, []net.IP, []string) {
	var dnsNames []string
	var ipAddresses []net.IP
	var emailAddresses []string

	for _, input := range inputs {
		// Check if it's an IP address
		if ip := net.ParseIP(input); ip != nil {
			ipAddresses = append(ipAddresses, ip)
			continue
		}

		// Check if it's an email address
		if strings.Contains(input, "@") {
			emailAddresses = append(emailAddresses, input)
			continue
		}

		// Otherwise, it's a DNS name
		dnsNames = append(dnsNames, input)
	}

	return dnsNames, ipAddresses, emailAddresses
}

// determineCommonName determines the common name for the certificate
func determineCommonName(inputs []string, certType CertificateType) string {
	if len(inputs) == 0 {
		return "Unknown"
	}

	// For S/MIME, use the email address
	if certType == CertTypeSMIME {
		for _, input := range inputs {
			if strings.Contains(input, "@") {
				return input
			}
		}
	}

	// Use the first input as the common name
	return inputs[0]
}

// determineOutputPaths determines the output file paths for the certificate and key
func determineOutputPaths(inputs []string, certFile, keyFile string) (string, string) {
	// If custom paths are provided, use them
	if certFile != "" && keyFile != "" {
		return certFile, keyFile
	}

	// Generate default paths based on first input
	baseName := sanitizeFilename(inputs[0])
	if len(inputs) > 1 {
		baseName = fmt.Sprintf("%s+%d", baseName, len(inputs)-1)
	}

	certPath := certFile
	if certPath == "" {
		certPath = fmt.Sprintf("./%s.pem", baseName)
	}

	keyPath := keyFile
	if keyPath == "" {
		keyPath = fmt.Sprintf("./%s-key.pem", baseName)
	}

	return certPath, keyPath
}

// sanitizeFilename sanitizes a string to be used as a filename
func sanitizeFilename(s string) string {
	// Remove invalid characters
	s = strings.ReplaceAll(s, "*", "wildcard")
	s = strings.ReplaceAll(s, ":", "-")
	s = strings.ReplaceAll(s, "/", "-")
	s = strings.ReplaceAll(s, "\\", "-")
	s = strings.ReplaceAll(s, "@", "-at-")
	return s
}

// saveCertificate saves a certificate to a PEM file
func saveCertificate(cert *x509.Certificate, path string) error {
	// Ensure directory exists
	dir := filepath.Dir(path)
	if dir != "." && dir != "" {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return fmt.Errorf("failed to create directory: %w", err)
		}
	}

	certFile, err := os.Create(path)
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

// savePrivateKey saves a private key to a PEM file
func savePrivateKey(key interface{}, path string) error {
	// Ensure directory exists
	dir := filepath.Dir(path)
	if dir != "." && dir != "" {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return fmt.Errorf("failed to create directory: %w", err)
		}
	}

	keyFile, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0600)
	if err != nil {
		return fmt.Errorf("failed to create key file: %w", err)
	}
	defer keyFile.Close()

	var keyPEM *pem.Block

	switch k := key.(type) {
	case *rsa.PrivateKey:
		keyPEM = &pem.Block{
			Type:  "RSA PRIVATE KEY",
			Bytes: x509.MarshalPKCS1PrivateKey(k),
		}
	case *ecdsa.PrivateKey:
		keyBytes, err := x509.MarshalECPrivateKey(k)
		if err != nil {
			return fmt.Errorf("failed to marshal ECDSA key: %w", err)
		}
		keyPEM = &pem.Block{
			Type:  "EC PRIVATE KEY",
			Bytes: keyBytes,
		}
	default:
		return fmt.Errorf("unsupported key type")
	}

	if err := pem.Encode(keyFile, keyPEM); err != nil {
		return fmt.Errorf("failed to write key file: %w", err)
	}

	return nil
}

// generateFromCSR generates a certificate from a CSR file
func generateFromCSR(csrPath, certFile string, cfg *Config) (string, error) {
	// Load CSR
	csrData, err := os.ReadFile(csrPath)
	if err != nil {
		return "", fmt.Errorf("failed to read CSR file: %w", err)
	}

	csrBlock, _ := pem.Decode(csrData)
	if csrBlock == nil {
		return "", fmt.Errorf("failed to decode CSR PEM")
	}

	csr, err := x509.ParseCertificateRequest(csrBlock.Bytes)
	if err != nil {
		return "", fmt.Errorf("failed to parse CSR: %w", err)
	}

	// Verify CSR signature
	if err := csr.CheckSignature(); err != nil {
		return "", fmt.Errorf("invalid CSR signature: %w", err)
	}

	// Load intermediate CA
	caKey, caCert, err := loadIntermediateCA()
	if err != nil {
		return "", err
	}

	// Get serial number
	serial, err := getSerialNumber()
	if err != nil {
		return "", err
	}

	// Create certificate template from CSR
	template := &x509.Certificate{
		SerialNumber:          big.NewInt(serial),
		Subject:               csr.Subject,
		NotBefore:             time.Now(),
		NotAfter:              time.Now().AddDate(0, 0, cfg.DefaultValidityDays),
		DNSNames:              csr.DNSNames,
		IPAddresses:           csr.IPAddresses,
		EmailAddresses:        csr.EmailAddresses,
		KeyUsage:              x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth, x509.ExtKeyUsageClientAuth},
		BasicConstraintsValid: true,
		IsCA:                  false,
	}

	// Create certificate
	certDER, err := x509.CreateCertificate(rand.Reader, template, caCert, csr.PublicKey, caKey)
	if err != nil {
		return "", fmt.Errorf("failed to create certificate: %w", err)
	}

	// Parse certificate
	cert, err := x509.ParseCertificate(certDER)
	if err != nil {
		return "", fmt.Errorf("failed to parse certificate: %w", err)
	}

	// Determine output path
	certPath := certFile
	if certPath == "" {
		// Use CSR filename with .pem extension
		base := strings.TrimSuffix(filepath.Base(csrPath), filepath.Ext(csrPath))
		certPath = fmt.Sprintf("./%s.pem", base)
	}

	// Save certificate
	if err := saveCertificate(cert, certPath); err != nil {
		return "", err
	}

	return certPath, nil
}
