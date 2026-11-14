# AssetTrust v0.52 — Test evidence

| Verification | Result | Qualification |
|---|---|---|
| New v0.52 scanner and integration tests | **13/13 PASS** | Mock local Unix ClamAV server and service-level stubs; not live malware signature evidence |
| Historical/current version commands v0.03–v0.52 | **50/50 PASS** | Multiple batches; first batch stopped after successful v0.29, later batches finished |
| Clean Architecture checks | **3/3 PASS** | Offline architecture constraints |
| TypeScript/TSX transpile syntax | **104 files, 0 syntax errors** | Syntax-only; not dependency-aware tsc build |
| Static CI completeness | **PASS** | 50 suite scripts, 24 PG contracts; not proof that CI ran on a hosted runner |
| Migration fingerprint comparison | **25/25 unchanged** | No new SQL, not proof migrations applied |
| Current-source high-confidence secret scan | **2,079 files, 0 detected issues** | Not full Git history / independent secret scan |
| Real ClamAV clean + EICAR contract | **BLOCKED (nonzero exit)** | No ClamAV daemon configured here |
| Authentic npm lockfile / supply-chain audit | **BLOCKED** | `package-lock.json` absent |
| Full API/web build | **FAILED** | Required NestJS, TS/Node types and other packages unavailable |
| Read-only release preflight | **BLOCKED: 3/11 prerequisites** | Not a production release approval |
| Live PostgreSQL RLS and browser tests | **NOT RUN** | Requires disposable DB/dependencies/browser |

Logs and the release plan are in `test-evidence/v52/`. No malware signatures, npm dependency tree, full Git history, or private production credentials are included in the ZIP. **Release: NO-GO.**
