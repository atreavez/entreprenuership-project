# AssetTrust v0.46 - Test evidence (11 November 2026)

- **13/13 new offline tests PASS**: tenant UUID validation, parameterized transaction-local GUC, exact RLS policies, admin and recipient context insertion, startup privileges, migration manifest, CI coverage and fail-closed runtime behavior.
- **44/44 historical/current version suite commands PASS**, v0.03 to v0.46. Initial batch through v0.31 was cut short by the environment command limit; later batch v0.32 to v0.46 was rerun. The original v0.41 test assumption was repaired and rerun; final logs all pass.
- **47/47 offline commands PASS**, counting architecture, syntax and CI completeness.
- **102 TypeScript/TSX source files**: transpile-only syntax scan, zero diagnostics. NOT a type-check or compiled build.
- **21/21 migration SHA-256 fingerprints**: correct by source manifest comparison. Migration 021 is additive.
- **1,726 snapshot files scanned**, 0 high-confidence secret matches. Does not include historical Git data.
- PostgreSQL live RLS contract: **NOT RUN**. Test refused without explicit disposable-data authorization, as intended. PostgreSQL/pg unavailable.
- Clean dependency installation: **BLOCKED**, no genuine package-lock.json and dependencies absent.
- Full build: **FAILED on missing dependencies** (`@types/node`, `@nestjs/common` etc.).
- Production readiness preflight: **BLOCKED**, 3/11 prerequisites present. No production approval.

Evidence retained under `test-evidence/v46/` with console logs, a matrix summary and the read-only release prerequisite report. See `V46_SECURITY_REPORT.md` for release blockers.
