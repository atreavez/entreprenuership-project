# AssetTrust v0.45 - Security Implementation and Release Assessment

**Review date:** 11 November 2026  
**Baseline:** v0.44  
**Production decision: NO-GO.**  
**Scope:** Database-backed account login attempt limits, MFA challenge behavior, related CI and deployment checks. Not a comprehensive penetration test.

## What changed

Auth login now reserves its place in a PostgreSQL per-account counter *before* verifying a password. An atomic `INSERT ... ON CONFLICT DO UPDATE` serializes concurrent reservations at the database primary key across app instances. The first 10 attempts within 15 minutes can proceed. The 11th receives HTTP 429. A locked account stays locked until the database-maintained deadline; a lock does not disappear merely because the first attempt becomes 15 minutes old. The limiter uses a distinct, random 32-byte HMAC pepper. It stores only a hex digest of the normalized email, attempt counter and timestamps. Passwords, email, IP addresses and token values are absent from this table.

Successful password-only authentication clears the counter; successful MFA clears it only *after* the second factor. Wrong passwords, failed MFA challenges and suspended accounts do not clear a counter. The existing Argon2id and dummy-hash design remains intact. Existing per-instance Nest throttling and challenge-level PostgreSQL attempt limits remain in place as additional controls.

Production startup now rejects a missing or unsafe `LOGIN_ABUSE_PEPPER` and detects reuse with MFA or document encryption keys. No actual operational pepper, private key or vendor credential is included. Migration `020_distributed_login_abuse.sql` is forward-only and leaves all 19 previous migration files unchanged.

## Scope of validation actually performed

- **11/11 new v0.45 offline tests passed**, covering HMAC normalization, malformed keys, lockout after the tenth reservation, counter clearing, fail-closed database access, actual transpiled HTTP controller sequencing, MFA gating, production startup key checks, SQL source shape and CI coverage.
- **43/43 offline version suites passed**, v0.03-v0.45, in the final source.
- **47/47 offline verification commands passed**, comprising 43 version suites, architecture, source syntax, CI coverage and high-confidence snapshot scanning.
- **100 TS/TSX files** passed syntax transpilation, 0 syntax diagnostics. This is **not a full TypeScript typecheck**.
- **20/20 SQL migration file SHA-256 fingerprints** match the source manifest; no prior migration contents were changed.
- High-confidence source scanner scanned **1,619 text/source files** with 0 pattern matches. **Full Git history was not scanned** because this checkpoint contains no `.git` repository.
- Read-only release preflight failed, as intended. The full build failed from absent dependencies and Node type declarations. No authentic lockfile is included.
- Disposable PostgreSQL test harness was **not run against a live database**. Without opt-in, its guard rejected execution before connecting or importing `pg`.

## What is not proven

The counter logic is not validated with simultaneous real PostgreSQL transactions in this environment. CI configuration contains the test, but configuration is not execution evidence. Installed package versions, vulnerabilities, real HTTPS ingress, server firewall/SSH exposure, tenant isolation and database privileges, malware scanning, browser CSRF behavior, live administrator permissions, pricing/payment correctness, backup restore, email delivery, and complete Git-history secrets scanning remain unverified or partially implemented.

**Database row-level security remains a high-priority gap.** The `Database.query()` pool executes independent queries with no request-scoped tenant setting. Turning on RLS over tenant tables without first migrating queries into explicit tenant-scoped transactions and defining a dedicated runtime database role could break valid access or leave privileged bypasses. RLS must be implemented and adversarially tested as a separate milestone; do not confuse parameterized tenant filters with DB-enforced RLS.

## Risk register

| ID | Severity | Risk | Status and required action |
|---|---|---|---|
| AT45-01 | High | Distributed credential stuffing / brute force | Source mitigation present. Prove concurrency and account lockout on disposable PostgreSQL and two API instances. |
| AT45-02 | High | Account-targeted denial of service via HMAC-keyed lockout | Mitigation incomplete. Add tested edge source-based limits, alerting, support unlock policy and sensible monitoring. |
| AT45-03 | High | Row-level tenant data isolation not enforced | Open. Design runtime DB roles, per-transaction tenant scope, RLS policies and adversarial cross-tenant tests. |
| AT45-04 | High | Unknown dependency vulnerabilities | Open. Genuine lockfile, `npm ci`, `npm audit`, SBOM and remediation required. |
| AT45-05 | High | Historical secret exposure unverified | Open. Whole-history independent scan on canonical Git repository; rotate confirmed exposures. |
| AT45-06 | High | Evidence upload malware processing not verified | Open. Quarantine, malware scan, allowed file signatures and upload contract tests required. |
| AT45-07 | High | Live build, TLS, browser, database, two-server tests absent | Open. Run and retain evidence on approved Kali test environment and staging deployment. |
| AT45-08 | Medium | MFA challenge resubmission across new challenge IDs | Partly mitigated by retaining account counter until second-factor completion; test cross-node behavior under load. |

## Release verdict

**NO-GO / BLOCKED.** v0.45 is an offline-tested development checkpoint. It is not security certified, production-ready, or guaranteed to resist hackers. Release requires implementation and verification of the cross-project final security gate, with no unresolved critical/high vulnerabilities.
