// Silence pino logs during tests
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'fatal';
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

// Longer timeout for key generation & E2E flows
jest.setTimeout(60000);

// Cleanup any .tmp-* directories at repo root after each test file finishes
const fs = require('fs');
const path = require('path');
const REPO_ROOT = path.resolve(__dirname, '..');

afterAll(() => {
	try {
		const entries = fs.readdirSync(REPO_ROOT, { withFileTypes: true });
		for (const e of entries) {
	if (e.isDirectory() && (e.name.startsWith('.tmp-') || e.name === '.tmp-test' || e.name === '.tmp-e2e' || e.name === '.tmp-admin' || e.name === '.tmp-acme' || e.name === '.tmp-audit')) {
				try { fs.rmSync(path.join(REPO_ROOT, e.name), { recursive: true, force: true }); } catch {}
			}
		}
	} catch {}
});
