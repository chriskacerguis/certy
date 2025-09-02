# todo / roadmap items

## Audit page

- [ ] Date range filters and CSV/JSON export
- [ ] Row “details” modal (pretty-printed JSON) and quick filters by user/IP
- [x] Retention setting (env: AUDIT_RETENTION_DAYS, default 90)

## Security and hardening

- [x] Banner when KEYSTORE_SECRET_OLD is set (reminder to remove after rotation)
- [ ] Health/status page: CA initialized, DB path, CRL URL, key warnings
- [ ] Clear docs for TRUST_PROXY, secure cookies, CSP, and CSRF

## Ops and reliability

- [x] Backup/restore guide with exact files and minimal downtime steps
- [ ] CLI/admin script for headless keystore rotation and CA destroy (even if ENABLE_CA_LIFECYCLE=false)
- [ ] CRL publish: retry/backoff
- [x] CRL “last published” status in UI
- [ ] Support more backend databases (use Knex.js)

## Observability

- [ ] /metrics (Prometheus) for request counts, durations, errors, queue sizes
- [ ] Log guidance: levels, sampling, correlation IDs

## Certificate UX

- [ ] Search/filter issued certs; quick renew/reissue and bulk revoke with audit
- [ ] Optional email templates for S/MIME delivery
- [ ] Multi-language support
- [x] Disability compliant

## Access control

- [ ] Basic roles (admin vs. viewer/issuer) and audit-only view

## Testing

- [ ] E2E tests for rotation, destroy, CRL publish; migration integrity test

## Docs

- [ ] Admin route/API reference, threat model, and a short hardening checklist
