# AssetTrust v0.73 — Security Review and Release Decision

**Decision: NO-GO.** Security-sensitive application source improved, but only offline and simulated acceptance was possible here.

## Threat addressed

**TOCTOU on encrypted document retrieval.** Former code authorized access using separate, sequential database checks, then fetched the encrypted blob without locking the actor, asset, case, grant, or document while the file was read. A concurrent revocation could occur in the gap. The new same-transaction path uses transaction-local tenant RLS, `FOR SHARE` locks and current DB membership/role checks. A nonexpired grant and current case participation are checked as appropriate. Access denied before authorization prevents blob decryption. A conflicting permission-changing database transaction should wait for the read transaction's locks to finish, subject to PostgreSQL transaction and lock deadlines.

A completed download cannot be retroactively recalled after HTTP transmission. The implementation does not promise that revocation cancels bytes already read or transferred. PostgreSQL lock behavior must be confirmed with concurrent sessions on Kali; simulated tests are insufficient for operational assurance.

## Preserved defenses

- AES-256-GCM storage and SHA-256 verification; legacy plaintext remains unreadable via HTTP.
- Current authenticated user membership and role, case-only confidentiality, organization-scoped SQL and RLS contract.
- Existing 27 source migrations, 16 reviewed policies and current provider/admin boundaries untouched.
- Existing scanner fail-closed upload behavior and explicit local-only, synthetic test authorization.
- Live suite verifies multi-tenant denial, approved reviewer access, revocation and post-revocation denial (prepared but not run live here).

## Verification evidence

- 31/31 new v73 tests (source-level and mocked-service/HTTP scenarios).
- 33/33 version suites v41–v73, 555 passing TAP tests, no failures in recorded suites.
- Architecture, TS syntax preflight, CI completeness passed.
- Limited current-source credential scan: 0 high-confidence matches in 3,349 scanned files, *not* complete security proof.
- Offline `npm run build` failed due to missing application dependencies. Production npm audit could not be completed without an authentic lockfile; preflight reports **BLOCKED**.
- **Not tested live:** real PostgreSQL row-lock scheduling and blocked revocation, authenticated browser workflows, ClamAV, TLS, restore/rollback, original Git-history scan, payment handling, multiple API instances, security penetration tests.

## Deployment hardening still mandatory

Do not deploy until verified in staging with genuine dependencies and trusted lockfile, restricted PostgreSQL runtime role, actual row-lock race/adversarial tests, upload scanning, admin MFA and separate tenant controls, audit append-only behavior, strict server-side validation, secrets rotation on findings, dependency scanning, reverse proxy HTTPS, private SSH, incident/restore tests, and independent signoff. Runtime role must not own protected tables or possess `BYPASSRLS` privileges.
