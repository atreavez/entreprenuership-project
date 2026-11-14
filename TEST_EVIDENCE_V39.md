# AssetTrust v0.39 — engineering test evidence and release decision

**Checkpoint:** Confidential, independently approved recipient sharing of non-official private PDF reports.
**Environment:** Linux container, Node.js v22.16.0, npm v10.9.2, global TypeScript compiler. No project `node_modules`, no genuine npm lockfile and no disposable PostgreSQL instance available in this runtime.

## Recorded successful checks

| Check | Observed result | Evidence |
| --- | --- | --- |
| New v0.39 domain/security/service/migration/route tests | **9/9 PASS** | `test-evidence/v39/verify-v39.log` |
| Historical version checks v0.03–v0.39 inclusive | **37/37 PASS** | `test-evidence/v39/verify-v03.log` … `verify-v39.log` |
| Architecture assertions | **PASS** | `test-evidence/v39/verify-architecture.log` |
| TS/TSX syntax transpilation | **91 files, 0 syntax errors** | `test-evidence/v39/verify-syntax.log` |
| Disposable PostgreSQL contract script parser | **PASS** (`node --check`) | `tools/e2e-pg-recipient-shares-v39.mjs` |
| SQL migration fingerprints and forward-only order | **PASS** (17/17 matching `schema-manifest.ts` entries) | v0.39 tests and the migration plan |

An independent local manifest check confirmed 17/17 migration hashes exactly match the SQL file bytes.

The v0.39 test suite verifies bounded input, high-entropy independently generated secret tokens, constant-time dual secret matches, expired/revoked/consumed-grant denial, strict admin delegation, cross-tenant rejection, current report-status gates, tampering refusal, and append-only migration/audit declarations. Mocked service tests do **not** demonstrate real PostgreSQL locks, end-to-end authorization, real PDF download, or working browser routes.

### Test-first record

Initial v0.39 service regression run recorded **8/9 PASS** because the mocked signed-PDF service test did not populate signing-environment variables. The test fixture was corrected to use fake, nonproduction configuration, and final tests passed **9/9**. Separately, a concurrency review identified a potential stale-read window; the report and case are now locked first, then current withdrawal/dispute/supersession flags are read in a *fresh SQL statement*. The final v0.39 suite passed after this correction.

### Compatibility update

A v0.38 test originally required the database migration list to end at migration 016. The historical test has been changed to require that migration 016 remains present, without preventing forward-only migration 017. It still verifies the original migration content and approved-layout behavior. No previously applied migration SQL was edited.

## Tests explicitly NOT passed or NOT RUN

- **`npm ci --offline --ignore-scripts --dry-run`: FAILED** with `EUSAGE` because the inherited checkpoint has **no authentic package-lock.json**. This is a release blocker, not a test success.
- **Full API/web production build: NOT RUN**. NestJS, React/Vite and other project dependencies are not installed here. A TypeScript syntax-only scan does not substitute for type checking.
- **Live PostgreSQL/PostGIS migration 017: NOT RUN**; no writable disposable database and relevant dependencies available. Use the guarded `npm run test:pg:recipient:v39` only after safe test provisioning.
- **Authenticated browser/UI integration: NOT RUN**; no running API, test organization or two-admin MFA sessions.
- **External recipient identity validation, TLS deployment controls, certificate authority, genuine production key rotation and penetration testing: NOT RUN**.

## Explicit verdict

**OFFLINE-TESTED DEVELOPMENT CHECKPOINT — NOT PRODUCTION READY.**

Do not accept real personal land evidence, invite external clients or deploy this checkpoint until the missing dependency, database, browser, operational, legal and independent security gates are completed and recorded. Recipient access is capability-based and does not prove the person holding both credentials is the intended recipient. Digital signatures authenticate bytes, not the truth of legal ownership claims.
