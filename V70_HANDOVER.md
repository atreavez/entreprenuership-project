# AssetTrust v0.70 — Isolated Kali Runtime Integration

**Checkpoint date:** 12 November 2026  
**Base:** v0.69 authenticated admin/tenant acceptance  
**Release status:** **NO-GO** (no production approval)

## What this milestone actually changes

Previous checkpoints shipped strong security checks but had no repeatable *independent* local database fixture. The existing `compose.yaml` starts the persistent development database `assettrust` on port 5432 with an example password, whereas the newer E2E suites refuse databases unless they are named `assettrust_ci` or `assettrust_test` and require a second non-owner API role. This mismatch made it easy to point validation commands at the wrong database. v0.70 fixes the operational handoff without touching existing business records or weakening tests.

The new **`compose.integration-v70.yaml`** is an entirely separate Docker Compose project (`assettrust-v70-disposable`): PostGIS 17/PostgreSQL 17 at `127.0.0.1:55432`, a *new* `assettrust_test` database and a one-off randomly generated PostgreSQL password read from an owner-only Docker secret file. A separate optional local ClamAV scanner binds to `127.0.0.1:13310`. The original `compose.yaml` is unchanged. The dedicated database has an independent named volume; it must **never** be reused as production or shared staging data.

The new **`tools/local-kali-integration-v70.cjs`** provides a guarded, executable workflow rather than another release claim. It can generate a private test configuration, start local Docker services using an explicit local Unix socket, run migration application and idempotence checks, provision the existing v0.57 non-BYPASSRLS role, check live RLS policies and role privileges, and run the existing five-suite supervised HTTP acceptance journey after authentic source build acceptance. All potentially mutating modes require `ASSETTRUST_V70_LOCAL_CONFIRM=YES` and refuse a production environment. The API is never started against the migration owner when the strict runtime role is enforced.

`--prepare` refuses existing private settings rather than changing stored document or database encryption keys. It writes to `.assettrust-local/v70` with restricted owner-only permissions and does **not** touch `.env`, existing databases, credentials, Git history or customer records. This private directory is explicitly gitignored. The supervisor refuses an unreviewed lockfile or compiled artifacts for HTTP testing, keeps raw subprocess logs out of the console result, and **never** reports production approval.

### Changed files

- `compose.integration-v70.yaml` — fresh, loopback-only PostGIS + optional local ClamAV.
- `tools/local-kali-integration-v70.cjs` — new source and live commands with strict guard rails.
- `tools/tests-v70/kali-postgis-v70.test.cjs` — 29 dependency-free regression tests, including rejected production/remote targets, private file permissions, non-owner role restrictions, command ordering and fail-closed behavior.
- `package.json`, `apps/api/package.json`, `apps/web/package.json` — version 0.70.0 and new Kali commands.
- `.github/workflows/ci.yml` — adds `verify:v70` to post-install unit verification.
- `.gitignore` — blocks accidentally committing `.assettrust-local` credentials.
- `tools/tests-v69/authenticated-control-v69.test.cjs` — compatibility with v0.70 version while retaining v0.69 authorization checks.
- Updated current README header, runbook, security report and evidence.

No product/business-domain endpoints, schema migrations, database RLS predicates, or privileged role grants were changed. The 27 SQL migration files and tenant-isolation domain contract are byte-for-byte unchanged relative to v0.69.

## Verification performed here

- **29/29** v0.70 tests passed.
- **30/30** version-script suites from v0.41 through v0.70 passed, with **482 counted TAP passing cases** across those runs; see `test-evidence/v70/regression/` and `regression-matrix.json`.
- Architecture, TypeScript/TSX syntax, source import preflight and GitHub Actions workflow-contract checks passed.
- Limited current-source high-confidence secret scan passed: 3,214 files, zero flagged matches. Not an independent scan of original Git history.
- New Compose YAML parsed successfully using a YAML parser; **Docker Compose startup itself was not performed**.
- The read-only build acceptance inspector correctly reported missing authentic `package-lock.json`. The source package has no installed NestJS/Vite/node_modules and this execution environment cannot reach the npm registry.
- **No Docker daemon, PostgreSQL/PostGIS instance or ClamAV daemon was available for live execution**, and no authenticated HTTP/API live acceptance was performed here.

## Immediate Kali follow-up

Use `V70_KALI_VALIDATION.md` step-by-step on your own trusted Kali machine. Preserve the **first failing command** and a *redacted* result code or summary. Do **not** paste private `.assettrust-local/v70` files, database URLs, JWT keys or unredacted Docker logs. A passing v0.70 integration run is an important prerequisite but never automatic production permission.

## Release gate (still open)

Real `npm ci`/audit/compilation, independent original-Git-history security scan, ClamAV CLEAN+INFECTED self-test, migrations/PostGIS, 16 exact RLS policies/13 sensitive tables under a restricted non-owner login, authenticated organization-admin/reviewer and MFA workflows, full browser acceptance, cross-tenant adversarial tests, secure document uploads, HTTPS/network exposure review, backups/restores and a signed human security decision must all succeed. Critical findings block release. Retain DDD/TDD/SOLID/Clean Architecture and security-by-design as mandatory.
