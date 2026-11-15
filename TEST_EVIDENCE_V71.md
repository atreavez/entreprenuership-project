# AssetTrust v0.71 — Reproducible Test Evidence

Date: 12 November 2026. Scope: offline source/unit tests and build-preflight failure evidence only.

| Check | Result | Evidence path |
|---|---|---|
| `npm run verify:v71` | 21 passed, 0 failed | `test-evidence/v71/regression/v71.log` |
| `verify:v41` through `verify:v71` (individual scripts) | 31/31 passed, 503 counted TAP test cases | `test-evidence/v71/regression/matrix.json` and per-version logs |
| Architecture boundaries | Passed | `test-evidence/v71/gates/architecture.log` |
| TypeScript / TSX source syntax | Passed | `test-evidence/v71/gates/syntax.log` |
| Vite source entry/import preflight | Passed | `test-evidence/v71/gates/source-imports.log` |
| CI workflow contract | Passed | `test-evidence/v71/gates/ci-contract.log` |
| Limited current-source secret scan | Passed: 3,265 files; zero high-confidence matches | `test-evidence/v71/gates/secret-source.log` |
| Build acceptance inspector | BLOCKED: no authentic reviewed `package-lock.json` | `test-evidence/v71/gates/build-inspection.log` |
| `npm run build` | FAILED: missing NestJS/Node packages and definitions | `test-evidence/v71/gates/full-build.log` |
| Real Docker + PostgreSQL/PostGIS + ClamAV | NOT RUN | No live evidence |
| Real compiled API, MFA, administrator and cross-tenant HTTP | NOT RUN | No live evidence |
| Original Git history scanning and browser acceptance | NOT VERIFIED | `.git` and connected deployment absent |

**Interpretation:** Offline tests executed, but the real application was not built or run. The seven-stage v0.71 supervisor was tested using synthetic subprocess results; **this does not constitute a live successful acceptance run**. The only real `npm run build` in this environment failed for missing dependencies. Unverified gates are blockers, not passes. Production release **NO-GO**.
