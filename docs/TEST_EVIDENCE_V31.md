# AssetTrust v0.31 — Test evidence and release verdict

**Checkpoint:** Content & Template Admin Foundation

## Results directly observed in this workspace

| Check | Result |
| --- | --- |
| New v0.31 offline tests | **29 passed, 0 failed** |
| Offline verification commands (including previous suites) | **32 passed, 0 failed** |
| Strict isolated typecheck of new pure TypeScript domain policy | Passed |
| TS/TSX source transpile syntax check | **72 files, 0 diagnostics** |
| Desktop static source preview (1440px) | Rendered; no horizontal overflow |
| Mobile static source preview (390px) | Rendered; no horizontal overflow |
| CI YAML parse | Passed |
| `node --check` on SQL test script | Passed |
| ZIP integrity | Check at packaging time |

The v0.31 domain/service tests exercise the real TypeScript files using offline TypeScript transpilation and controlled database substitutes. They are **not** a real running NestJS/PostgreSQL test. Preview images are source-rendered static HTML, not a live Vite/browser app.

## Explicitly failed or unexecuted release gates

- `npm ci --offline --ignore-scripts`: **FAIL** — npm refuses installation without `package-lock.json`.
- `npm run release:gate:v17`: **FAIL** — reviewed lockfile not found.
- `npm run build`: **FAIL** — NestJS, Node typings, and related project dependencies unavailable. No successful API or React production build verified.
- `node tools/e2e-pg-content-v31.mjs` without mutation consent: **EXPECTED SAFETY REFUSAL**. No database was connected and no SQL contract was executed.
- Live PostgreSQL/PostGIS migration, real API authentication, browser E2E, template publication integration: **NOT EXECUTED**.

## Evidence files

`test-evidence/v31/regression-summary.csv` contains each of the 32 commands and exit codes. Individual logs are present alongside `full-build-attempt.log`, `npm-ci-attempt.log`, `release-gate-attempt.log`, and `pg-guard-attempt.log`. The first policy RED log captures missing implementation before the new domain module was added; it is not evidence of a previously deployed vulnerability.

## Security assertions

- Only an allowlisted catalogue is editable; no arbitrary scripting, HTML, or hidden policy keys.
- Same-tenant privileges and live administrator/MFA checks are required for writes.
- Sensitive revisions remain pending until independent approval, with optimistic version checks and audit records.
- Platform content requires a separate live platform appointment.
- Permanent non-ownership wording is rendered outside the editable template body.
- Submitted and signed evidence history is never rewritten by changing a template.

**Release verdict: NOT PRODUCTION-READY.**
