package main

import (
	"crypto/x509"
	"encoding/pem"
	"os"
	"path/filepath"
	"testing"
)

func TestParseInputs(t *testing.T) {
	tests := []struct {
		name           string
		inputs         []string
		expectedDNS    []string
		expectedIPs    int
		expectedEmails []string
	}{
		{
			name:           "single domain",
			inputs:         []string{"example.com"},
			expectedDNS:    []string{"example.com"},
			expectedIPs:    0,
			expectedEmails: []string{},
		},
		{
			name:           "wildcard domain",
			inputs:         []string{"*.example.com"},
			expectedDNS:    []string{"*.example.com"},
			expectedIPs:    0,
			expectedEmails: []string{},
		},
		{
			name:           "IPv4 address",
			inputs:         []string{"127.0.0.1"},
			expectedDNS:    []string{},
			expectedIPs:    1,
			expectedEmails: []string{},
		},
		{
			name:           "IPv6 address",
			inputs:         []string{"::1"},
			expectedDNS:    []string{},
			expectedIPs:    1,
			expectedEmails: []string{},
		},
		{
			name:           "email address",
			inputs:         []string{"user@example.com"},
			expectedDNS:    []string{},
			expectedIPs:    0,
			expectedEmails: []string{"user@example.com"},
		},
		{
			name:           "mixed inputs",
			inputs:         []string{"example.com", "127.0.0.1", "::1", "user@example.com"},
			expectedDNS:    []string{"example.com"},
			expectedIPs:    2,
			expectedEmails: []string{"user@example.com"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			dnsNames, ipAddresses, emailAddresses := parseInputs(tt.inputs)

			if len(dnsNames) != len(tt.expectedDNS) {
				t.Errorf("Expected %d DNS names, got %d", len(tt.expectedDNS), len(dnsNames))
			}
			for i, dns := range tt.expectedDNS {
				if dnsNames[i] != dns {
					t.Errorf("Expected DNS name %s, got %s", dns, dnsNames[i])
				}
			}

			if len(ipAddresses) != tt.expectedIPs {
				t.Errorf("Expected %d IP addresses, got %d", tt.expectedIPs, len(ipAddresses))
			}

			if len(emailAddresses) != len(tt.expectedEmails) {
				t.Errorf("Expected %d email addresses, got %d", len(tt.expectedEmails), len(emailAddresses))
			}
			for i, email := range tt.expectedEmails {
				if emailAddresses[i] != email {
					t.Errorf("Expected email %s, got %s", email, emailAddresses[i])
				}
			}
		})
	}
}

func TestDetermineCommonName(t *testing.T) {
	tests := []struct {
		name     string
		inputs   []string
		certType CertificateType
		expected string
	}{
		{
			name:     "TLS with domain",
			inputs:   []string{"example.com"},
			certType: CertTypeTLS,
			expected: "example.com",
		},
		{
			name:     "S/MIME with email",
			inputs:   []string{"user@example.com"},
			certType: CertTypeSMIME,
			expected: "user@example.com",
		},
		{
			name:     "Client with domain",
			inputs:   []string{"client.example.com"},
			certType: CertTypeClient,
			expected: "client.example.com",
		},
		{
			name:     "Multiple inputs",
			inputs:   []string{"example.com", "*.example.com", "127.0.0.1"},
			certType: CertTypeTLS,
			expected: "example.com",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cn := determineCommonName(tt.inputs, tt.certType)
			if cn != tt.expected {
				t.Errorf("Expected CN %s, got %s", tt.expected, cn)
			}
		})
	}
}

func TestDetermineOutputPaths(t *testing.T) {
	tests := []struct {
		name         string
		inputs       []string
		certFile     string
		keyFile      string
		expectedCert string
		expectedKey  string
	}{
		{
			name:         "custom paths",
			inputs:       []string{"example.com"},
			certFile:     "/tmp/custom.pem",
			keyFile:      "/tmp/custom-key.pem",
			expectedCert: "/tmp/custom.pem",
			expectedKey:  "/tmp/custom-key.pem",
		},
		{
			name:         "single domain",
			inputs:       []string{"example.com"},
			certFile:     "",
			keyFile:      "",
			expectedCert: "./example.com.pem",
			expectedKey:  "./example.com-key.pem",
		},
		{
			name:         "multiple domains",
			inputs:       []string{"example.com", "*.example.com", "localhost"},
			certFile:     "",
			keyFile:      "",
			expectedCert: "./example.com+2.pem",
			expectedKey:  "./example.com+2-key.pem",
		},
		{
			name:         "wildcard domain",
			inputs:       []string{"*.example.com"},
			certFile:     "",
			keyFile:      "",
			expectedCert: "./wildcard.example.com.pem",
			expectedKey:  "./wildcard.example.com-key.pem",
		},
		{
			name:         "email address",
			inputs:       []string{"user@example.com"},
			certFile:     "",
			keyFile:      "",
			expectedCert: "./user-at-example.com.pem",
			expectedKey:  "./user-at-example.com-key.pem",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			certPath, keyPath := determineOutputPaths(tt.inputs, tt.certFile, tt.keyFile)
			if certPath != tt.expectedCert {
				t.Errorf("Expected cert path %s, got %s", tt.expectedCert, certPath)
			}
			if keyPath != tt.expectedKey {
				t.Errorf("Expected key path %s, got %s", tt.expectedKey, keyPath)
			}
		})
	}
}

func TestSanitizeFilename(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"example.com", "example.com"},
		{"*.example.com", "wildcard.example.com"},
		{"user@example.com", "user-at-example.com"},
		{"::1", "--1"},
		{"127.0.0.1", "127.0.0.1"},
		{"with/slash", "with-slash"},
		{"with\\backslash", "with-backslash"},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			result := sanitizeFilename(tt.input)
			if result != tt.expected {
				t.Errorf("Expected %s, got %s", tt.expected, result)
			}
		})
	}
}

func TestSaveAndLoadCertificate(t *testing.T) {
	// Create temp directory
	tmpDir := t.TempDir()
	certPath := filepath.Join(tmpDir, "test.pem")

	// Create a minimal certificate for testing
	// We'll use a real certificate from CA generation
	customCADir = tmpDir
	defer func() { customCADir = "" }()

	// Install CA first
	if err := installCA(); err != nil {
		t.Fatalf("Failed to install CA: %v", err)
	}

	// Load intermediate CA
	_, caCert, err := loadIntermediateCA()
	if err != nil {
		t.Fatalf("Failed to load CA: %v", err)
	}

	// Save certificate
	if err := saveCertificate(caCert, certPath); err != nil {
		t.Fatalf("Failed to save certificate: %v", err)
	}

	// Verify file exists
	if _, err := os.Stat(certPath); os.IsNotExist(err) {
		t.Error("Certificate file was not created")
	}

	// Load and verify certificate
	certData, err := os.ReadFile(certPath)
	if err != nil {
		t.Fatalf("Failed to read certificate: %v", err)
	}

	block, _ := pem.Decode(certData)
	if block == nil {
		t.Fatal("Failed to decode PEM")
	}

	if block.Type != "CERTIFICATE" {
		t.Errorf("Expected CERTIFICATE block, got %s", block.Type)
	}

	_, err = x509.ParseCertificate(block.Bytes)
	if err != nil {
		t.Errorf("Failed to parse certificate: %v", err)
	}
}

func TestDetectCertificateType(t *testing.T) {
	tests := []struct {
		name       string
		inputs     []string
		clientAuth bool
		expected   CertificateType
	}{
		{
			name:       "email triggers S/MIME",
			inputs:     []string{"user@example.com"},
			clientAuth: false,
			expected:   CertTypeSMIME,
		},
		{
			name:       "client flag triggers client auth",
			inputs:     []string{"client.example.com"},
			clientAuth: true,
			expected:   CertTypeClient,
		},
		{
			name:       "domain triggers TLS",
			inputs:     []string{"example.com"},
			clientAuth: false,
			expected:   CertTypeTLS,
		},
		{
			name:       "IP triggers TLS",
			inputs:     []string{"127.0.0.1"},
			clientAuth: false,
			expected:   CertTypeTLS,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			certType := detectCertificateType(tt.inputs, tt.clientAuth)
			if certType != tt.expected {
				t.Errorf("Expected %v, got %v", tt.expected, certType)
			}
		})
	}
}

func TestGenerateCertificate(t *testing.T) {
	// Create temp directory
	tmpDir := t.TempDir()
	customCADir = tmpDir
	defer func() { customCADir = "" }()

	// Install CA
	if err := installCA(); err != nil {
		t.Fatalf("Failed to install CA: %v", err)
	}

	// Load config
	cfg, err := loadConfig()
	if err != nil {
		t.Fatalf("Failed to load config: %v", err)
	}

	tests := []struct {
		name         string
		inputs       []string
		certType     CertificateType
		useECDSA     bool
		validateFunc func(*testing.T, *x509.Certificate)
	}{
		{
			name:     "TLS certificate with RSA",
			inputs:   []string{"example.com", "*.example.com"},
			certType: CertTypeTLS,
			useECDSA: false,
			validateFunc: func(t *testing.T, cert *x509.Certificate) {
				if !contains(cert.ExtKeyUsage, x509.ExtKeyUsageServerAuth) {
					t.Error("Missing ServerAuth extended key usage")
				}
				if len(cert.DNSNames) != 2 {
					t.Errorf("Expected 2 DNS names, got %d", len(cert.DNSNames))
				}
			},
		},
		{
			name:     "Client certificate with ECDSA",
			inputs:   []string{"client.example.com"},
			certType: CertTypeClient,
			useECDSA: true,
			validateFunc: func(t *testing.T, cert *x509.Certificate) {
				if !contains(cert.ExtKeyUsage, x509.ExtKeyUsageClientAuth) {
					t.Error("Missing ClientAuth extended key usage")
				}
				if cert.PublicKeyAlgorithm != x509.ECDSA {
					t.Error("Expected ECDSA public key algorithm")
				}
			},
		},
		{
			name:     "S/MIME certificate",
			inputs:   []string{"user@example.com"},
			certType: CertTypeSMIME,
			useECDSA: false,
			validateFunc: func(t *testing.T, cert *x509.Certificate) {
				if !contains(cert.ExtKeyUsage, x509.ExtKeyUsageEmailProtection) {
					t.Error("Missing EmailProtection extended key usage")
				}
				if len(cert.EmailAddresses) != 1 {
					t.Errorf("Expected 1 email address, got %d", len(cert.EmailAddresses))
				}
			},
		},
		{
			name:     "Multiple SANs with IPs",
			inputs:   []string{"example.com", "127.0.0.1", "::1"},
			certType: CertTypeTLS,
			useECDSA: false,
			validateFunc: func(t *testing.T, cert *x509.Certificate) {
				if len(cert.IPAddresses) != 2 {
					t.Errorf("Expected 2 IP addresses, got %d", len(cert.IPAddresses))
				}
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			certPath, keyPath, err := generateCertificate(tt.inputs, tt.certType, tt.useECDSA, "", "", cfg)
			if err != nil {
				t.Fatalf("Failed to generate certificate: %v", err)
			}

			// Clean up after test
			defer os.Remove(certPath)
			defer os.Remove(keyPath)

			// Verify files exist
			if _, err := os.Stat(certPath); os.IsNotExist(err) {
				t.Error("Certificate file was not created")
			}
			if _, err := os.Stat(keyPath); os.IsNotExist(err) {
				t.Error("Key file was not created")
			}

			// Load and validate certificate
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

			// Verify common properties
			if cert.Subject.CommonName == "" {
				t.Error("Common name is empty")
			}

			if cert.IsCA {
				t.Error("Certificate should not be a CA")
			}

			// Run custom validation
			if tt.validateFunc != nil {
				tt.validateFunc(t, cert)
			}
		})
	}
}

// Helper function
func contains(slice []x509.ExtKeyUsage, item x509.ExtKeyUsage) bool {
	for _, s := range slice {
		if s == item {
			return true
		}
	}
	return false
}
