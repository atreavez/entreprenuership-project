# AssetTrust v0.85 — Test Evidence

## Offline tests executed on 12 November 2026

| Test category | Actual outcome |
|---|---|
| New `npm run verify:v85` | **43 / 43 PASS** |
| 45 historical suites, `verify:v41`–`verify:v85` | **45 / 45 PASS** |
| Counted passing TAP tests | **915** |
| Architecture | PASS |
| TypeScript source transpilation (109 TS/TSX; syntax only) | PASS |
| Vite source/import graph | PASS |
| Direct dependency-import contract | PASS |
| CI completeness / v53 YAML security policy | PASS |
| Limited high-confidence secret scan | PASS |
| Migration file identity v84 -> v85 | 27 / 27 IDENTICAL |
| Authentic lockfile preflight | FAIL / BLOCKED: absent `package-lock.json` |
| Full `npm run build` | FAIL: NestJS / Node declarations unavailable (`node_modules` absent) |
| PostgreSQL / PostGIS / authenticated HTTP / browser | NOT EXECUTED |
| Whole Git-history secret scan | INCOMPLETE: ZIP has no `.git` metadata |
| Final production release gate | NO-GO |

### Machine-readable evidence and logs

The individual regression logs are available in `test-evidence/v85/version-suites/verify-vNN.log` and the machine-readable complete matrix in `test-evidence/v85/regression-matrix.json`. Every row must have `exit_code=0` to claim the 45/45 result. The new test fixture runs the actual source-snapshot verifier and independently compiled runtime policy, with synthetic npm and filesystem operations. These are **offline tests**, not a real npm dependency install.

### Reproduce

```bash
npm run verify:v85
npm run verify:architecture
npm run verify:syntax
npm run build:source:v56
npm run build:imports:v80
npm run verify:ci:v53
npm run lockfile:check:v55
npm run build
```

A fresh archive should fail the final two commands until a genuine reviewed lockfile and install have been performed on a connected development machine. Do not interpret these as test passes.
