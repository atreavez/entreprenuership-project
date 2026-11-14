# AssetTrust v0.75 — Security assessment (source-level)

**Assessment date:** 2026-11-12  
**Decision:** **NO-GO** for production.

## Risk addressed

The authentication guard reads the current user from the database at request start, but privileges can change while a long-running request continues. v0.75 reduces those time-of-check/time-of-use gaps for asset and case listing/detail reads, confidential evidence lists and asset creation. Sensitive reads now verify active membership and current role using SQL and, where multiple statements are needed, retain row locks until the protected read completes. Asset creation uses a transaction-scoped `FOR SHARE` membership lock before the INSERT and audit.

## Tests actually executed

- 24/24 new v0.75 tests; 35/35 suite scripts v0.41–v0.75 (598 TAP passes reported).
- Architecture and syntax gates pass; reviewed 27 migrations and RLS policy contract remain unchanged.
- Limited source scanner examined 3,441 files with no high-confidence findings. This does not prove the project or its original Git history is free of secrets.

## Known release blockers

- Missing genuine reviewed npm lockfile; failed full build from absent installed TypeScript/NestJS dependencies.
- No Docker/PostGIS/ClamAV or real authenticated HTTP tests executed in the offline build container.
- No proof yet that PostgreSQL locking and RLS behave correctly on the target database major version under actual concurrency.
- No original `.git` history in the source ZIP, no independent secret-history audit, no online dependency audit, no browser end-to-end test, no restore/rollback validation and no actual production infrastructure hardening evidence.
- The v0.75 changes do not certify finance, platform-admin, workflow review, system-wide permission coverage, or payment/provider integration.

**Security gate:** fail closed. No production release until authentication, tenant isolation, MFA, secret rotation, safe uploads, server-authoritative pricing/payments, HTTPS, CSRF, rate limiting, SSH restrictions, audits, evidence retention, dependency fixes, adverse-case tests and rolling deployment rollback have passed independently on trusted staging.
