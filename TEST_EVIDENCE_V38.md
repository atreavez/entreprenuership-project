# AssetTrust v0.38 — executed test evidence and release verdict

**Evaluation date:** 11 November 2026. **Status:** OFFLINE-TESTED DEVELOPMENT CHECKPOINT; NOT PRODUCTION-READY.

## Direct verification

| Command / check | Actual result | Evidence in ZIP |
|---|---|---|
| `npm run verify:v38` | **PASS, 9/9 tests** | `test-evidence/v38/verify-v38.log` |
| Historical `verify:v03` through `verify:v37` | **PASS, 35/35 version-suite commands** | `test-evidence/v38/verify-v03.log` ... `verify-v37.log` |
| `npm run verify:architecture` | **PASS** | `test-evidence/v38/architecture.log` |
| `npm run verify:syntax` | **PASS, 87 TS/TSX files with 0 syntax diagnostics** | `test-evidence/v38/syntax.log` |
| PDF view / `pdfinfo` / `pdftotext` | **PASS; two A4 pages** | Fictional `AssetTrust_v38_DEMO_Branded_Report.pdf` (outside source ZIP) and v0.38 domain test |
| Demo detached Ed25519 receipt | **PASS** against the exact PDF bytes and independently supplied demo public key | Demo PDF, JSON receipt and demo trust key (outside source ZIP) |
| Attempt to verify altered PDF | **REJECTED** in test, as intended | `test-evidence/v38/verify-v38.log` |
| Migration plan and schema manifest | **PASS**; migration 016 fingerprint equals committed manifest, earlier 001–015 fingerprints retained | `verify-v11.log` and `verify-v38.log` |

The first regression run reached v0.31 before its command-window expired. v0.32–v0.37 were then run separately. v0.11 was initially incompatible with the new migration manifest and v0.35 had a fixed 15-migration assertion; both were fixed without modifying historical SQL and now pass their entire suites. The revised tests still require original 001–015 historical fingerprints. The v0.37 PDF tests pass after the page-heading pagination change.

## Limits and blocking gates

- `npm ci --offline --ignore-scripts`: **FAILED** because the archive lacks an authentic, reviewed `package-lock.json`; no network package installation was performed in the evaluation environment. See `test-evidence/v38/npm-ci-attempt.log`.
- `npm run build`: **FAILED** because NestJS, React and Node type dependencies are not installed; cannot certify full TypeScript/build output. See `test-evidence/v38/build-attempt.log`.
- **NOT EXECUTED:** live PostGIS migration `016`, actual two-administrator browser journey, real MFA and organization session integration, database isolation under concurrency, authenticated PDF HTTP download, production key management, backup restore, penetration test.
- **NOT CLAIMED:** externally certified ownership information, government registry validation, native PAdES signing, verified real-world evidence, or legal certification.

The approval and export service tests use mocked database transactions. The source-only syntax check is *not* a complete typecheck. A separate staging deployment must verify end-to-end behavior before any real recipient or asset records are used.

**VERDICT: v0.38 is a functioning source-level feature with 9 passing dedicated tests and all historical offline version commands passing, but it is not deployable for real customers until dependencies, build, migration, live HTTP/UI and security gates pass.**
