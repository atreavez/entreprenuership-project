# AssetTrust v0.18 — MFA Recovery-Code Replay Fix

**Compiled by: Aturinzire Hargreave**  
**Engineering:** DDD · TDD · SOLID · Clean Architecture · Security by Design  
**Status:** DEVELOPMENT CHECKPOINT / NO PRODUCTION APPROVAL

## Fixed

- A previously consumed backup code (used to complete MFA login) could previously be reused to authorize an MFA-disable request when the current password was also supplied. The MFA-disable SQL now requires `consumed_at IS NULL` before it can delete a recovery-code row.
- The MFA-disable operation now checks backup-code format against the same domain validation function used by MFA login. The domain function is framework independent.
- Added a runtime regression harness executing the actual AuthenticationService disable method with mocked infrastructure, including consumed and unused recovery-code cases. This is **not** a PostgreSQL test.
- Extended the already existing disposable localhost HTTP identity test with the consumed-code disable check, MFA-still-enabled check, and unused-code success check. It must be exercised against a real test deployment before production release.
- Added `verify:v18` to local scripts and CI policy checks. Existing React, verification, documents, mapping, and billing prototype screens were retained unchanged.

## Validation

- `npm run verify:v18`: 5 tests passed, **actual auth service method executed** with in-memory query substitute.
- Purposeful RED: first regression test failed against the previous SQL; all five pass after the GREEN fix.
- `npm run smoke:offline` plus every `verify:v03`–`verify:v18`, `verify:architecture`, and `verify:syntax` passed in the delivery environment.
- `npm run build` failed with TS2688 missing `@types/node`. `npm ci --offline` failed due to missing lockfile; DNS lookup of npm registry failed (`EAI_AGAIN`). No PostgreSQL/Docker server is available in this workspace.
- **Release blocked** until authentic npm lockfile, `npm ci`, full API/web build, database migrations, HTTP tests and security review pass on a connected machine.

See `docs/V18_KALI_AND_SECURITY.md` and `docs/TEST_EVIDENCE_V18.md`.
