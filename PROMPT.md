I want to make a CLI app in Go.

It should be a very simple system to run a CA

The command will be called "certy", it should support the following command line switches.

  -install
    Create a rootCA with an intermediateCA

	-cert-file FILE, -key-file FILE, -p12-file FILE
	    Customize the output paths.

	-client
	    Generate a certificate for client authentication.

	-ecdsa
	    Generate a certificate with an ECDSA key.

	-pkcs12
	    Generate a ".p12" PKCS #12 file, also know as a ".pfx" file,
	    containing certificate and key for legacy applications.

	-csr CSR
	    Generate a certificate based on the supplied CSR. Conflicts with
	    all other flags and arguments except -install and -cert-file.

The command should work like this:

Example 1: certy example.com "*.example.com" example.test localhost 127.0.0.1 ::1

It will take any number of domains, or IP addresses and create a certificate for them.  In this example the output files should be "./example.com+5.pem" and the key at "./example.com+5-key.pem"

Example 2: certy user@domain.com 

It should detect if it was passed and email address create an SMIME certificate.
