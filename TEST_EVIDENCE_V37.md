# AssetTrust v0.37 - Executed tests and release verdict

**Executed on 11 November 2026.** These results describe local synthetic tests against v0.37 source and do not establish a production deployment.

| Test or check | Observed result | Retained evidence |
|---|---|---|
| New v0.37 PDF renderer, Ed25519 receipt, offline CLI, tamper/forgery checks, multipage layout, server service boundary tests | **8/8 PASS** | `test-evidence/v37/verify-v37.log` |
| Existing historical version suites v0.03 through v0.36 | **34/34 command PASS** (completed in two sets because batch time limit) | `test-evidence/v37/verify-v03.log` ... `verify-v36.log` |
| Architecture boundary checks | **PASS** | `test-evidence/v37/architecture.log` |
| TS/TSX syntax-only scan | **84 source files, 0 syntax errors** | `test-evidence/v37/syntax.log` |
| PDF parser/extractor | **PASS** (`pdfinfo`, `pdftotext` on synthetic PDF) | v0.37 renderer tests + exported demonstration PDF |
| Independent offline verification | **PASS** (accept authentic bytes; reject modified PDF, payload, key and receipt) | v0.37 tests and `tools/verify-report-pdf-v37.cjs` |
| SQL schema change | **NONE** (15 prior migrations retained) | source migration list |

## Not passed / not executed

- `npm ci --offline --ignore-scripts`: **FAILED**, no authentic `package-lock.json` in the source archive. This must be created against a real npm registry and checked in after review. See `test-evidence/v37/npm-ci-attempt.log`.
- `npm run build`: **FAILED**, installed Node/NestJS/React type dependencies are missing; this is not a successful full typecheck. See `test-evidence/v37/build-attempt.log`.
- PostgreSQL/PostGIS schema integration and live HTTP/browser two-admin E2E: **NOT RUN** in the current environment. A source-level mock test is not a live database integration test.
- Key revocation/distribution lifecycle, signed native PAdES PDF, professional/legal validation, human penetration test and all intended multilingual characters: **NOT COMPLETE**.

## Precision of the claim

The separate Ed25519 receipt signs the entire PDF's SHA-256 fingerprint and relevant report metadata. The independent verifier checks exact PDF bytes using a separately trusted public key. The PDF itself is not cryptographically signed in the native PDF/PAdES format. Signatures prove configured key possession and byte integrity, not legal ownership, official government records, original evidence truth, or live status. Source evidence remains available in the prior v0.36 authenticated JSON export.

**Verdict: v0.37 OFFLINE-TESTED DEVELOPMENT CHECKPOINT; PRODUCTION RELEASE BLOCKED.**
