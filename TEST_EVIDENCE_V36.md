# AssetTrust v0.36 — Executed Evidence and Release Verdict

**Artifact generation date:** 11 November 2026. Tests executed locally against the v0.36 source; source is NOT deployed or production-certified.

## Offline passes

| Check | Executed result | Evidence |
|---|---|---|
| v0.36 Ed25519 attestation, offline CLI, key generation, access/tenant/audit/service tests | **10/10 PASS** | `test-evidence/v36/final-check.log` |
| Existing version-specific verification commands v0.03–v0.36 | **34/34 PASS** | `test-evidence/v36/verify:v03.log` through `verify:v36.log` (latest v0.36 in `final-check.log`) |
| Architecture verification | **PASS** | `test-evidence/v36/architecture-final.log` |
| TypeScript/TSX **syntax-only** transpilation | **83 files, 0 syntax errors** | `test-evidence/v36/syntax-final.log` |
| Offline domain smoke | **PASS** | `test-evidence/v36/smoke-final.log` |
| Key-generator test | **PASS** (Ed25519, private 0600, refuse overwrite, no private bytes in output) | v0.36 test cases |
| Independent signature verification | **PASS** for valid signed bundle; tampered evidence, metadata, signature and untrusted public key rejected | v0.36 test cases |
| Previously released regression v0.34/v0.35 | **28/28 + 16/16 PASS**, with test-loader compatibility changes | `verify:v34.log`, `verify:v35.log` |
| Migration count | **15** (no new v0.36 migration; existing SQL remains unchanged) | `tools/migrations/plan.cjs`, `apps/api/sql/` |

## Blocked or not attempted

- **Full `npm ci`: FAIL**, because there is no genuine resolved `package-lock.json`. The environment also cannot resolve the npm registry by DNS. `test-evidence/v36/npm-ci-attempt.log`.
- **Full `npm run build`: FAIL** due to missing installed `@types/node`, NestJS and other project packages; not an observed new code typecheck success. `test-evidence/v36/build-attempt.log`.
- **Existing NestJS `npm test`: FAIL** at dependency resolution because modules are not installed; not evidence that any application assertion failed. `test-evidence/v36/npm-test-attempt.log`.
- **Live PostgreSQL/PostGIS:** no database client/service available in this environment; schema checks and authenticated HTTP/database E2E not run.
- **Real browser/UI runtime:** no production Vite/React bundle or real two-admin browser E2E run. No deployed end-to-end verification.
- **Independent security audit, key revocation/distribution process, signed-PDF generation and Ugandan professional/legal review:** not completed.

## What is actually assured

On the tested source and synthetic fixtures: the Ed25519 signature cryptographically covers the canonical private evidence payload; a pinned public key verifies it offline; changed payloads or unknown keys fail; export service code enforces current admin fresh MFA, organization isolation, original hash verification and audit logging. This proof is **not** a substitute for a live SQL/HTTP test or a production adversarial review.

**Verdict: OFFLINE-TESTED v0.36 DEVELOPMENT CHECKPOINT. PRODUCTION RELEASE BLOCKED.** No official land registry validation or PAdES-signed PDF is claimed.
