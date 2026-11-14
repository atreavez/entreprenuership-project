# AssetTrust v0.78 — Security and Release Report

**Final verdict: NO-GO** (source checkpoint only; no production approval).

## Reviewed change

The migration CLI used a blocking session advisory lock, creating an unbounded wait risk during concurrent deployment. A second migration/check now uses `pg_try_advisory_lock` with a parameterized historical lock ID and fails before schema reads or writes if the lock is unavailable. Sessions are closed even after connection, SQL or cleanup errors. Failed rollback states and uncertain COMMIT outcomes are reported as failures, never success. No SQL migrations were changed and existing explicit baseline and ledger-integrity controls remain in place.

## Verified here

- Offline v0.78 fault-injection tests: 30/30 PASS.
- Historical recent version scripts: v0.41–v0.78, 38/38 PASS, 695 counted successful TAP tests.
- Historical v0.11 migration tests: 10/10 PASS.
- Source architecture, TypeScript syntax-only, relative import and CI configuration gates: PASS.
- 27 SQL migrations unchanged; previous reviewed RLS policy source unchanged.
- Limited current-tree high-confidence secret scan: 3,526 scanned files, 0 matches (not a guarantee of no secrets).

## Unresolved high-priority blockers

1. Authentic npm lockfile absent; cannot establish complete reproducible dependency installation or audit; full NestJS/React build fails due missing installed packages and typings.
2. Real PostgreSQL migration-lock and schema checks, restricted runtime roles, PostGIS, ClamAV, two-instance API and authenticated browser workflows unexecuted here.
3. Original Git history absent; strict history-scanning command fails closed. Independent full-history scan and credential rotation review required.
4. Final security hardening and release controls are mandatory and not yet verified: password hashing, auth/MFA, tenant isolation at service/query/DB, TLS and server-only secrets, signed/audited actions, rate limiting, CSRF/cookie policy, reset-token expiry, malware scanning and upload restrictions, SQL parameterization, privileged access controls, dependency vulnerabilities, backups and adversarial testing.

**No user data, production settings, PostgreSQL schema migrations, blockchain anchors or payment provider configurations were modified by the v0.78 source changes.**

The read-only live PostgreSQL test is prepared and wired into CI but has **not** run successfully here. A source test passing is not evidence that the compiled application or deployment is ready.
