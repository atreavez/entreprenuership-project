# AssetTrust v0.77 — Security assessment

**Status: NO-GO.** Completed source-level fix, not a live production security audit.

## Defect and remediation

**Risk addressed:** One case's resolved dispute could clear an asset-wide flag while a different case for the same asset was still under dispute. This could misrepresent verification confidence to organization users.

**Defense implemented:** Both dispute creation and resolution now lock the same tenant-scoped asset row (`FOR UPDATE`) before locking their case and dispute. Following resolution, asset status can be changed only if a tenant- and asset-scoped count shows **zero** `OPEN`/`INVESTIGATING` disputes across *all* cases. Case reassignment detected after the initial locator is a fail-closed conflict. User membership is checked at the time of mutation; existing audit events are preserved.

**Scope:** Core operations service and transaction-access infrastructure. No changes to payment execution, public verification verdicts, existing migrations (27 unchanged), or stored records.

## Tests and limitations

- 34 new tests pass; 16 of 22 cross-case tests fail against the unmodified v0.76 baseline (RED), with 22/22 passing on v0.77 (GREEN).
- 37 historical version suites v0.41–v0.77 pass; 665 counted TAP test successes.
- Architecture, syntax and CI contract checks pass.
- Limited current-source secret scan passes (3,517 files, zero high-confidence matches). **Original Git history is not scanned.**
- Live PostgreSQL acceptance runner authored, uses operator only for synthetic setup/cleanup and restricted runtime login for the actual service call. **Not run in this environment.**
- Full compile, runtime RLS, ClamAV, real HTTP/browser, role/MFA, active upload malware protection, payment/quote authorization, independent vulnerability/audit and backup-restore remain unverified. Lockfile missing.

## Residual risk

- Asset flag status can be changed by other application workflows that do not share the new row-lock ordering; those need a separate cross-workflow status/provenance review before release.
- A successful PostgreSQL-only service test is not a fully booted NestJS API, not a browser acceptance test and not proof of all tenant/RLS policies.
- Live concurrency/locking and cleanup behavior remain unverified until execution on disposable Kali. On crash, fixture cleanup may require an authorized operator's review.
- Current source patterns cannot establish absence of secrets in earlier Git commits; scan complete Git history and rotate any exposed secrets.

**Mandatory final release gate:** valid passwords hashes, no plaintext secrets, current tenant-safe RBAC, admin MFA, CSRF/cookies, rate limits, server-authoritative prices and payments, validated uploads and ClamAV, HTTPS, restricted SSH, dependency audit and lockfile, log sanitization, deployment/rollback, and adversarial test evidence. All critical issues must be resolved before approval.
