# AssetTrust v0.48 — Test evidence and NO-GO verdict

**Date:** 11 November 2026  
**Scope:** Offline source regression and staged case-evidence RLS. No live database test was run.

## Passing tests

- **9/9 v0.48 unit/static contract tests:** policy, source access paths, startup guards, exact migration SHA-256, disposable test design, CI suite presence, historical policy retention and read-only audit.
- **46/46 version suites v0.03–v0.48:** logs retained in `test-evidence/v48/verify-vXX.log`. Historical test harnesses v0.24, v0.25, v0.32, v0.34, v0.35, v0.46 and v0.47 were updated for the new tenant-scope dependencies or forward-only migration history; all then passed.
- **3/3 additional offline commands:** architecture, CI-completeness, and TS/TSX syntax scan; **102 files** transpile without syntax diagnostics. Transpilation is not compilation or typechecking.
- **23/23 migration file fingerprints** match the immutable SQL source manifest; migration 023 appended without rewriting prior migrations.
- **Source scanner:** current snapshot scanned **1,859 files with zero high-confidence findings**. No `.git` data; no historical secret-scanning or key rotation performed.
- **CI workflow YAML** parsed without errors and version/PG-suite completeness checks passed.

## Unverified/failed gates

- **Live PostgreSQL evidence RLS contract:** NOT RUN. The test correctly refused to execute without explicit test authorization. A disposable PostgreSQL/PostGIS instance and installed `pg` are required.
- **Reproducible dependency install:** BLOCKED. A genuine `package-lock.json` and installed packages are absent.
- **Full API/web build:** FAILED on missing @nestjs/common, Node types and related dependencies. No statement of production build success is made.
- **Release preflight:** BLOCKED — only **3 of 11** stated prerequisites present.
- **No** authenticated browser, two-API concurrency, HTTPS/firewall, malware scanner, Git history, restore, package-audit or third-party penetration-test evidence.

**Release decision: NO-GO.** Source-only checks cannot prove live tenant isolation or make the system safe for private customer evidence.

See `test-evidence/v48/`, `V48_RLS_ARCHITECTURE.md`, `V48_SECURITY_REPORT.md` and `V48_KALI_VALIDATION.md`.
