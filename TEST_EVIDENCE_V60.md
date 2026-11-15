# AssetTrust v0.60 - Test Evidence

Date: 11 November 2026. Environment: isolated Linux container, Node.js 22.16.0, npm 10.9.2; no working npm registry resolution and no local PostgreSQL server.

| Check | Recorded result | Scope |
|---|---|---|
| New v0.60 tests | PASS, 15/15 | Unit/static, guarded entrypoints, CI sequencing and grant repair safety |
| Historical + current suites | PASS, 58/58 | `verify:v03` through `verify:v60`; subprocess exit codes captured independently |
| Schema migrations | PASS, 25/25 unchanged | Byte-for-byte comparison to v0.59, with SHA-256 inventory |
| CI parser / integrity policy | PASS | Ruby/Psych YAML validation and CI steps contract |
| CI completeness | PASS | Version scripts and registered PostgreSQL contracts covered |
| Architecture and syntax | PASS | Dependency boundaries/source syntax, not a full installed-package typecheck |
| Vite source gate | PASS | Local imports and entrypoint checked; compiled artifact not checked |
| Current-source credential scan | PASS, 2,693 files | Pattern-based source scan only; original Git history not available |
| Genuine `npm ci` | BLOCKED | No authentic `package-lock.json`; offline install cannot run |
| `npm run build` | FAILED/BLOCKED | Missing Node type definitions and installed dependencies (`TS2688`) |
| Release preflight | BLOCKED | Missing authentic npm lockfile |
| Live PostgreSQL permission check | NOT RUN | Requires disposable DB and restricted runtime connection |
| Seeded RLS/CRUD contracts | NOT RUN | Requires live PostgreSQL and approved synthetic fixtures |
| ClamAV and authenticated HTTP/browser E2E | NOT RUN | External services/build are not available here |
| Real source Git-history scan | NOT RUN | Full original repository `.git` history not in downloadable ZIP |

Full version-suite subprocess output: `test-evidence/v60/version-logs/` (58 logs). Results: `test-evidence/v60/version-matrix.json`. The migration manifest is `test-evidence/v60/migration-integrity.json`; CI/build/preflight failure logs are in `test-evidence/v60/final-checks/`.

**Interpretation:** Passing static security checks proves the intended policy is represented in source and its guarded code paths have unit coverage. It does not prove database ACLs, live authentication, deployment, HTTPS, organization isolation outside seven RLS tables, or suitability for commercial use.

**Release verdict: NO-GO.**
