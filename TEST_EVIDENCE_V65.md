# AssetTrust v0.65 — Offline test evidence (11 November 2026)

Base: exact v0.64 source archive. Offline environment: Node 22.16.0, npm 10.9.2; no accessible npm registry (`EAI_AGAIN`), no authentic package-lock.json, no project-local node_modules, no PostgreSQL daemon or configured live scanner. Production status: **NO-GO**.

## Passing commands observed

| Command | Observed outcome | Scope limit |
|---|---|---|
| `npm run verify:v65` | **16/16 pass** | New source/unit checks with simulated PostgreSQL responses, not a live DB |
| `npm run verify:v54` … `verify:v64` | **11/11 scripts exit 0** | Regression scripts; combined 196 passing per-suite cases |
| `npm run verify:architecture` | **3/3 pass** | Static architecture boundaries |
| `npm run verify:syntax` | **PASS**, 105 source TS/TSX files, 0 syntax diagnostics | Not an npm dependency-backed typecheck |
| `npm run build:source:v56` | **PASS**, 102 source files and 285 relative imports | Static Vite source/import preflight only |
| `npm run verify:ci:v41` | **PASS**, 63 version scripts/31 PG contracts | Static workflow consistency only |
| `npm run verify:ci:v53` | **PASS** | Workflow policy, not GitHub CI execution |
| `npm run diagnose:inspect:v65` | **PASS**, report schema v65 | Non-mutating prerequisites and 27/27 source migration checksum matches |

New v65 negative-path tests cover corrupt/missing/extra migration checksums, missing PostGIS/table, database query exception redaction and no readiness count leakage, optional integration failure separation, actual source migration hash tamper, no secret disclosure, read-only behavior, safe file permissions, symlink/dangling-symlink attacks and unsafe mode denial.

## Unverified gates

- Connected npm lockfile generation, `npm ci`, `npm audit`, API/React full builds and complete API test suite: **NOT RUN** (registry unreachable and genuine lockfile unavailable).
- Live PostgreSQL/PostGIS, restricted-role negative checks, two-organization seeded CRUD, browser sessions/E2E: **NOT RUN**.
- Full Git history scan, ClamAV daemon live scanning, deployed TLS/SSH, backup/restore and production incident response: **NOT VERIFIED**.

No version-specific security check was bypassed to obtain a passing result. Do not label these as production release tests.
