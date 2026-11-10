# AssetTrust v0.11 — Test evidence and limits

| Verification | Result here | Evidence |
| --- | --- | --- |
| Migration plan, ledger, rollback and baseline tests | 10 passed | `npm run verify:v11` |
| Pure schema readiness and embedded manifest tests | 8 passed | `npm run verify:v11` |
| Previous v0.3–v0.10 offline checks | Passed | `test-evidence/v11-offline-regressions.txt` |
| TypeScript/TSX syntax transpilation | 53 files / 0 syntax errors | `npm run verify:syntax` |
| Pure readiness domain typecheck | Passed | `tools/tests-v11/schema-readiness.test.cjs` compiles via tsc |
| Desktop source-derived preview | 1440px, no horizontal overflow | `screenshots/v11-readiness-desktop.png` |
| Mobile source-derived preview | 390px, no horizontal overflow | `screenshots/v11-readiness-mobile.png` |
| Full NestJS + React build | **Failed before compilation** | Missing npm dependency: `@types/node`; see `test-evidence/v11-full-build-attempt.txt` |
| PostgreSQL/PostGIS live migration | **Not run** | No PostgreSQL/Docker service in this environment |
| Live HTTP/browser E2E and security assessment | **Not run** | Requires a running staging environment |

**Evidence semantics:** unit/policy tests using simulated PostgreSQL responses do not establish that the SQL executes on a live PostgreSQL instance. Static React previews demonstrate responsive presentation, not functional MapLibre/browser/backend interactions. A ZIP integrity pass establishes archive readability, not deployment readiness.
