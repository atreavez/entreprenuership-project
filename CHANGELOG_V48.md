# v0.48 — Private Evidence PostgreSQL RLS

- Add migration 023: FORCE RLS on `case_evidence` with deny-without-tenant context and tenant-specific write checks.
- Scope evidence submission, list, report, issuance snapshot and reviewer repository within database transactions.
- Require the new protected table in production database-role/RLS preflight.
- Add rollback-only, non-owner, two-tenant disposable PostgreSQL test and a read-only RLS inventory query.
- Update CI, append-only schema checksum manifest, version metadata and legacy test harness compatibility.
- Maintain the cross-project mandatory security standard and production NO-GO verdict.

**Not added:** RLS on assets, cases, documents or users, verified live DB execution, a genuine dependency lockfile or a security sign-off.
