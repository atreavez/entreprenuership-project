# AssetTrust v0.79 — Security assessment

**Decision: NO-GO for production.**

## Remediation included

- Mitigates stale-role privilege leakage in dashboard overview, audit verification/list and integration status/local proof endpoints.
- Makes confidential case/evidence report reads dependent on a current, transaction-local locked case membership/participation check, rather than a separately committed preflight.
- Preserves tenant-local `set_config(..., true)` for each protected read, and existing PostgreSQL RLS rules. Does not authorize an external government registry search, blockchain anchoring or payment collection.
- Rejects inactive accounts for read-side entry points. A permission lock is retained until data is read or the transaction rolls back/commits.
- Adds 23 offline tests, including stale claims, suspended users, case access and audit integrity.

## Open mandatory release blockers

1. Missing **authentic registry-resolved, reviewed npm lockfile**; package installation and full builds have not passed. No manually invented lockfile is acceptable.
2. No live PostgreSQL/PostGIS verification in this container; transaction-lock serialization and RLS must be exercised using a restricted non-bypass runtime role, with simultaneous demotion/revocation attempts.
3. Real authenticated HTTP flows, administrator MFA, cross-tenant adversarial access tests, encryption/upload scanning, server-side payment authority, password protection, TLS, backups/restore and production observability require evidence.
4. Full original Git-history secret scan, credential rotation where appropriate, dependency audit, browser/accessibility regression, deployment/rollback/recovery and independent security tests remain outstanding.

Limited source credential scan returned zero high-confidence matches in 3,528 files, but cannot prove absence of secrets. This engineering checkpoint is not a signed or production approved release.
