# AssetTrust v0.73 — Engineering Handover

**Date:** 12 November 2026  
**From:** v0.72 checkpoint; no reset of existing application modules  
**Release decision:** **NO-GO** (offline-only acceptance evidence; connected Kali execution outstanding)

## Scope of implementation

v0.73 closes a document-download authorization time-of-check/time-of-use gap. Earlier `DocumentsService.getBytes()` fetched document metadata and called asset/case permission checks in separate database transactions, then loaded an encrypted blob. A concurrent grant revocation or case reassignment could complete between the permission check and blob retrieval.

The new implementation now:

1. Begins one `Database.transaction()`, sets the transaction-local organization scope, and reads the exact document under `FOR SHARE`.
2. Checks the authenticated principal's **current** database membership, suspension state, and role. `requireCurrentAssetRead()` locks the asset and user; for non-owners it also locks a qualifying case or nonexpired read/contribute grant. `requireCurrentCaseRead()` independently locks the case and actor and requires actual participation (or current organization administrator status). An asset grant alone cannot open confidential case evidence.
3. Reads the encrypted blob and verifies the SHA-256 digest **before committing and releasing** these permission locks. Denied/legacy/tampered documents fail closed and do not return decrypted bytes.
4. Rejects a document with neither an asset nor a case reference; continues to require AES-256-GCM envelope format and preserves encrypted storage and upload malware scanning.
5. Adds a *guarded*, synthetic-only live HTTP acceptance journey: two organizations, invited reviewer, encrypted document upload, authorized download, cross-tenant denial, read grant, exact-byte verification, grant revocation, and denial of subsequent download/list access.

## Changed source files

- `apps/api/src/contexts/access/infrastructure/transactional-access.ts`: two new PostgreSQL-specific read permission guards with row locks. Existing contribution guards remain unchanged.
- `apps/api/src/documents.ts`: transactional document read; no public API route or response-shape change.
- `tools/e2e-document-revocation-v73.mjs`: guarded, local-only six-suite integration addition. `--plan` is read-only; `--run` requires approved local target and an unpredictable owner marker.
- `tools/ci-live-integration.mjs`: sixth HTTP suite with dedicated opt-in; the supervisor continues to own and stop the API process.
- `tools/local-kali-integration-v70.cjs`: plan description updated from five to six HTTP suites (underlying disposable Compose and credentials remain unchanged).
- `tools/tests-v73/*.test.cjs`: direct tests of transpiled source and simulated real-HTTP journey, including negative permission cases.
- Root and workspace package versions `0.73.0`; CI and version scripts registered. Legacy v72 fixture was made forward-compatible without removing assertions.

## Evidence and limits

- New v73 tests **31/31 passed**.
- Individual `npm run verify:v41` through `npm run verify:v73` **33/33 passed**, with **555 counted TAP passes**. Individual run logs and status JSON are in `test-evidence/v73/version-suites/`; overall matrix in `test-evidence/v73/regression-matrix.json`.
- Architecture check, syntax-transpilation preflight and CI completeness passed. This is *not* a full TypeScript application build.
- Existing 27 SQL migrations and the approved RLS policies are unchanged.
- Limited source secret scanner returned zero high-confidence matches on 3,349 files during pre-packaging inspection; does *not* inspect original Git history or guarantee no secrets.
- `npm run release:preflight:v51` **BLOCKED**, missing an authentic `package-lock.json`.
- `npm run build` **FAILED/BLOCKED**, missing NestJS and Node definitions in this offline environment. Package registry DNS lookup also failed; genuine dependencies could not be installed here.
- Live PostgreSQL transaction locking, ClamAV, encrypted blob integration, browser, and supervised HTTP flow **NOT RUN**. The fake-PG tests do not establish real transaction-lock behavior. No production approval.

## Connected Kali entry

Follow `V73_KALI_VALIDATION.md` in a **separate trusted checkout**. Retain the original repo and existing PostgreSQL volumes. Resolve the lockfile and compilation first; use the existing disposable local PostGIS/ClamAV v70 environment; run supervised v73 acceptance and preserve *redacted* first-failure evidence. Do not paste secret environment values or raw server logs.

## Next release requirements

The cross-project final security hardening gate remains mandatory: independent password/MFA/authorization review, RLS live negatives and cross-tenant CRUD, server authoritative pricing/payment checks, malware scanning, production TLS/private SSH, CSRF and abuse defenses, supply chain and original Git-history secret audit with rotation, recovery/restore, rollback, browser acceptance, adversarial tests, and explicit release signoff. DDD, TDD, SOLID, Clean Architecture, and security-by-design are non-negotiable.
