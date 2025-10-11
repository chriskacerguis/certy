package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

var version = "dev"
var customCADir string // Global variable for custom CA directory

func main() {
	// Define flags
	installFlag := flag.Bool("install", false, "Create a rootCA with an intermediateCA")
	caDirFlag := flag.String("ca-dir", "", "Custom directory for CA files (default: ~/.certy)")
	certFileFlag := flag.String("cert-file", "", "Customize the certificate output path")
	keyFileFlag := flag.String("key-file", "", "Customize the key output path")
	p12FileFlag := flag.String("p12-file", "", "Customize the PKCS#12 output path")
	clientFlag := flag.Bool("client", false, "Generate a certificate for client authentication")
	ecdsaFlag := flag.Bool("ecdsa", false, "Generate a certificate with an ECDSA key")
	pkcs12Flag := flag.Bool("pkcs12", false, "Generate a PKCS#12 file")
	csrFlag := flag.String("csr", "", "Generate a certificate based on the supplied CSR")

	flag.Usage = func() {
		fmt.Fprintf(os.Stderr, "certy %s - Simple Certificate Authority CLI\n\n", version)
		fmt.Fprintf(os.Stderr, "Usage:\n")
		fmt.Fprintf(os.Stderr, "  certy [options] [domains/IPs/email...]\n\n")
		fmt.Fprintf(os.Stderr, "Examples:\n")
		fmt.Fprintf(os.Stderr, "  certy -install                                    # Initialize CA infrastructure\n")
		fmt.Fprintf(os.Stderr, "  certy example.com \"*.example.com\" 127.0.0.1      # Generate TLS certificate\n")
		fmt.Fprintf(os.Stderr, "  certy user@domain.com                             # Generate S/MIME certificate\n")
		fmt.Fprintf(os.Stderr, "  certy -client user@domain.com                     # Generate client auth certificate\n\n")
		fmt.Fprintf(os.Stderr, "Options:\n")
		flag.PrintDefaults()
	}

	flag.Parse()

	// Set custom CA directory if provided
	if *caDirFlag != "" {
		customCADir = *caDirFlag
	}

	// Validate flag conflicts
	if *csrFlag != "" {
		if *clientFlag || *ecdsaFlag || *pkcs12Flag || flag.NArg() > 0 {
			fatal("The -csr flag conflicts with all other flags except -install, -cert-file, -key-file, and -p12-file")
		}
	}

	// Handle -install flag
	if *installFlag {
		if err := installCA(); err != nil {
			fatal("Failed to install CA: %v", err)
		}
		fmt.Println("✓ CA infrastructure installed successfully")
		if !*installFlag && flag.NArg() == 0 && *csrFlag == "" {
			return
		}
	}

	// Check if we have work to do
	if flag.NArg() == 0 && *csrFlag == "" {
		if !*installFlag {
			flag.Usage()
			os.Exit(1)
		}
		return
	}

	// Ensure CA is installed before generating certificates
	if !caExists() {
		fatal("CA not found. Please run 'certy -install' first to initialize the CA infrastructure.")
	}

	// Load configuration
	cfg, err := loadConfig()
	if err != nil {
		fatal("Failed to load configuration: %v", err)
	}

	// Generate certificate
	var certPath, keyPath, p12Path string

	if *csrFlag != "" {
		// Generate from CSR
		certPath, err = generateFromCSR(*csrFlag, *certFileFlag, cfg)
		if err != nil {
			fatal("Failed to generate certificate from CSR: %v", err)
		}
		fmt.Printf("✓ Certificate generated: %s\n", certPath)
	} else {
		// Parse inputs
		inputs := flag.Args()
		if len(inputs) == 0 {
			fatal("No domains, IPs, or email addresses provided")
		}

		// Determine certificate type and generate
		certType := detectCertificateType(inputs, *clientFlag)

		certPath, keyPath, err = generateCertificate(inputs, certType, *ecdsaFlag, *certFileFlag, *keyFileFlag, cfg)
		if err != nil {
			fatal("Failed to generate certificate: %v", err)
		}

		fmt.Printf("✓ Certificate generated: %s\n", certPath)
		fmt.Printf("✓ Private key generated: %s\n", keyPath)

		// Generate PKCS#12 if requested
		if *pkcs12Flag {
			if *p12FileFlag != "" {
				p12Path = *p12FileFlag
			} else {
				p12Path = strings.TrimSuffix(certPath, filepath.Ext(certPath)) + ".p12"
			}

			if err := generatePKCS12(certPath, keyPath, p12Path); err != nil {
				fatal("Failed to generate PKCS#12 file: %v", err)
			}
			fmt.Printf("✓ PKCS#12 file generated: %s\n", p12Path)
		}
	}
}

func fatal(format string, args ...interface{}) {
	fmt.Fprintf(os.Stderr, "Error: "+format+"\n", args...)
	os.Exit(1)
}

func detectCertificateType(inputs []string, clientAuth bool) CertificateType {
	// Check if first input is an email (S/MIME)
	if len(inputs) > 0 && strings.Contains(inputs[0], "@") {
		return CertTypeSMIME
	}

	// Client authentication
	if clientAuth {
		return CertTypeClient
	}

	// Default to TLS server certificate
	return CertTypeTLS
}
