package main

import (
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"fmt"
	"math/big"
	"os"
	"time"
)

// RevokedCertificate represents a revoked certificate entry
type RevokedCertificate struct {
	SerialNumber *big.Int
	RevokedAt    time.Time
	Reason       int
}

// generateCRL generates a Certificate Revocation List (CRL)
func generateCRL(crlFile string) error {
	// Load intermediate CA
	intKey, intCert, err := loadIntermediateCA()
	if err != nil {
		return fmt.Errorf("failed to load intermediate CA: %w", err)
	}

	// Load revoked certificates list (if exists)
	revokedCerts, err := loadRevokedCertificates()
	if err != nil {
		// If file doesn't exist, start with empty list
		revokedCerts = []RevokedCertificate{}
	}

	// Create revoked certificate list for CRL
	var revokedCertList []pkix.RevokedCertificate
	for _, rc := range revokedCerts {
		revokedCertList = append(revokedCertList, pkix.RevokedCertificate{
			SerialNumber:   rc.SerialNumber,
			RevocationTime: rc.RevokedAt,
		})
	}

	// Create CRL template
	now := time.Now()
	crlTemplate := &x509.RevocationList{
		Number:              big.NewInt(now.Unix()), // Use timestamp as CRL number
		ThisUpdate:          now,
		NextUpdate:          now.AddDate(0, 0, 30), // Valid for 30 days
		RevokedCertificates: revokedCertList,
	}

	// Generate CRL
	crlDER, err := x509.CreateRevocationList(rand.Reader, crlTemplate, intCert, intKey)
	if err != nil {
		return fmt.Errorf("failed to create CRL: %w", err)
	}

	// Encode to PEM
	crlPEM := pem.EncodeToMemory(&pem.Block{
		Type:  "X509 CRL",
		Bytes: crlDER,
	})

	// Determine output path
	outputPath := crlFile
	if outputPath == "" {
		// Default to CA directory
		outputPath, err = getCAFilePath("crl.pem")
		if err != nil {
			return err
		}
	}

	// Write CRL file
	if err := os.WriteFile(outputPath, crlPEM, 0644); err != nil {
		return fmt.Errorf("failed to write CRL file: %w", err)
	}

	return nil
}

// loadRevokedCertificates loads the list of revoked certificates
func loadRevokedCertificates() ([]RevokedCertificate, error) {
	revokedPath, err := getCAFilePath("revoked.db")
	if err != nil {
		return nil, err
	}

	// Check if file exists
	if _, err := os.Stat(revokedPath); os.IsNotExist(err) {
		return []RevokedCertificate{}, nil
	}

	// Read file
	data, err := os.ReadFile(revokedPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read revoked certificates: %w", err)
	}

	// Parse simple format: serial,timestamp,reason (one per line)
	var revoked []RevokedCertificate
	if len(data) == 0 {
		return revoked, nil
	}

	// Parse each line
	lines := string(data)
	for _, line := range splitLines(lines) {
		if line == "" {
			continue
		}

		// Parse format: serial,timestamp,reason
		var parts []string
		start := 0
		for i := 0; i <= len(line); i++ {
			if i == len(line) || line[i] == ',' {
				parts = append(parts, line[start:i])
				start = i + 1
			}
		}

		if len(parts) != 3 {
			return nil, fmt.Errorf("invalid revoked certificate entry: %s", line)
		}

		serial := new(big.Int)
		if _, ok := serial.SetString(parts[0], 10); !ok {
			return nil, fmt.Errorf("invalid serial number in revoked.db: %s", parts[0])
		}

		timestamp := new(big.Int)
		if _, ok := timestamp.SetString(parts[1], 10); !ok {
			return nil, fmt.Errorf("invalid timestamp in revoked.db: %s", parts[1])
		}

		reason := new(big.Int)
		if _, ok := reason.SetString(parts[2], 10); !ok {
			return nil, fmt.Errorf("invalid reason in revoked.db: %s", parts[2])
		}

		revoked = append(revoked, RevokedCertificate{
			SerialNumber: serial,
			RevokedAt:    time.Unix(timestamp.Int64(), 0),
			Reason:       int(reason.Int64()),
		})
	}

	return revoked, nil
}

// splitLines splits a string by newlines
func splitLines(s string) []string {
	var lines []string
	start := 0
	for i := 0; i < len(s); i++ {
		if s[i] == '\n' {
			lines = append(lines, s[start:i])
			start = i + 1
		}
	}
	if start < len(s) {
		lines = append(lines, s[start:])
	}
	return lines
}

// revokeCertificate adds a certificate to the revoked list
func revokeCertificate(serialNumber string, reason int) error {
	// Parse serial number
	serial := new(big.Int)
	if _, ok := serial.SetString(serialNumber, 10); !ok {
		// Try hex format
		if _, ok := serial.SetString(serialNumber, 16); !ok {
			return fmt.Errorf("invalid serial number format")
		}
	}

	// Create revoked certificate entry
	rc := RevokedCertificate{
		SerialNumber: serial,
		RevokedAt:    time.Now(),
		Reason:       reason,
	}

	// Load existing revoked certificates
	revoked, err := loadRevokedCertificates()
	if err != nil {
		return err
	}

	// Check if already revoked
	for _, r := range revoked {
		if r.SerialNumber.Cmp(serial) == 0 {
			return fmt.Errorf("certificate with serial %s is already revoked", serialNumber)
		}
	}

	// Add to list
	revoked = append(revoked, rc)

	// Save back to file
	revokedPath, err := getCAFilePath("revoked.db")
	if err != nil {
		return err
	}

	// Simple format: serial,timestamp,reason
	var data string
	for _, r := range revoked {
		data += fmt.Sprintf("%s,%d,%d\n", r.SerialNumber.String(), r.RevokedAt.Unix(), r.Reason)
	}

	if err := os.WriteFile(revokedPath, []byte(data), 0644); err != nil {
		return fmt.Errorf("failed to write revoked certificates: %w", err)
	}

	return nil
}

// splitLines splits a string by newlines
