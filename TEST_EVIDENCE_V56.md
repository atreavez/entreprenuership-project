# v0.56 — Test Evidence Record (11 November 2026)

**Artifact:** AssetTrust source checkpoint v0.56. No access to live customer data or production infrastructure.

- **New tests:** `npm run verify:v56` — 20 tests / 20 passed / 0 failed. Coverage includes required Vite entrypoint, source graph, browser env restrictions, unsafe HTML, missing build artifacts, secret marker detection, sourcemaps, symlinks and release-runner/CI wiring.
- **Regression suites:** v0.03–v0.56 — 54 commands / 54 passed; logs are stored at `test-evidence/v56/verify-vNN.log`. Some long batches exceeded orchestration limits; individual completions and the v0.43 regression re-run were captured separately.
- **Static:** `npm run verify:ci:v41`, `npm run verify:ci:v53`, `npm run verify:architecture`, `npm run verify:syntax`, `npm run build:source:v56` — all passed. Syntax scan covers 104 TypeScript/TSX source files and is not a type-check.
- **Dependency graph:** 101 TypeScript/JavaScript source files inspected, 283 relative imports resolved, no source entry issues.
- **SQL:** 25 source migrations matched the prior checkpoint exactly. No v0.56 database migration.
- **Snapshot source secret scan:** 2,384 files inspected with zero high-confidence matches. Does not include canonical full Git history.
- **Expected blockers:** `npm run lockfile:check:v55` returns failure (missing genuine lockfile); `npm run build` returns failure (missing dependency typings/packages); `npm run build:artifacts:v56` returns failure (no compiled artifacts); release preflight returns NO-GO, 3/11 prerequisites present.
- **Never executed in this container:** genuine `npm ci`, full compile, real PostgreSQL and ClamAV integration, two live servers, browser sessions, external TLS or the canonical history scan.

This document is not evidence of production security acceptance. See `V56_SECURITY_REPORT.md` and `V56_KALI_VALIDATION.md`.
