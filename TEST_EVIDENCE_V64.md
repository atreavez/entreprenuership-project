# AssetTrust v0.64 — actual observed test evidence

**11 November 2026.** Base source: v0.63 archive materialized from AssetTrust Library; v0.64 changed only orchestration, associated tests, release documentation, package versions and CI coverage. The offline runtime has Node v22.16.0 but **no authentic package-lock.json, installed npm project dependencies or running PostgreSQL server**.

## Verified PASS in this environment

- `npm run verify:v54` through `npm run verify:v64`: **11 individually executed suites, all exit 0**. Their TAP pass counts respectively: v54=15, v55=16, v56=20, v57=20, v58=15, v59=15, v60=15, v61=16, v62=18, v63=31, v64=15. These are per-suite tests and should not be counted as unique integration tests.
- v0.64 new tests **15/15 PASS**, including blocked execution when lockfile/build/authorization missing, no subprocess spawn in denied situations, no approval on a simulated passing runner, local evidence file protections, secret redaction and symlink protection.
- `npm run verify:architecture`: PASS.
- `npm run verify:syntax`: PASS — 105 TS/TSX source files syntax-transpiled; **not** equivalent to full typecheck.
- `npm run verify:ci:v41`: PASS — CI workflow references **62 version scripts and 31 PostgreSQL contracts**.
- `npm run verify:ci:v53`: PASS — static workflow policy.
- `npm run build:source:v56`: PASS — static Vite/relative-import preflight checks 102 files and 285 relative imports; **not** a full build.
- `npm run integration:plan:v64` and `npm run integration:inspect:v64`: PASS as plan/inspection, **not** runtime validation.
- SQL migration count remains **27**; no new migration added.

## Intentional blockers / NOT RUN

- `npm run integration:build:v64`: **BLOCKED (exit 1)** because the authenticated/reviewed `package-lock.json` is missing; the runner correctly did not launch the supervised build plan.
- Full `npm ci`, production dependency audit, full API and React compilation: **NOT VERIFIED**.
- Live PG/PostGIS RLS inventory, seeded cross-tenant checks, admin/recipient flows, HTTP/browser E2E, ClamAV live verdict, original Git history and backup restoration: **NOT VERIFIED**.
- An attempt to run the entire 62-script historical matrix was interrupted by this environment's execution timeout; it is **NOT** reported as a complete matrix pass. Individual v54-v64 suites above were later re-run and completed successfully.

**Status: OFFLINE ENGINEERING CHECKPOINT; RELEASE NO-GO.** `V64_KALI_VALIDATION.md` contains the trusted connected-system steps needed to close the remaining evidence gap.
