# AssetTrust v0.87 — Engineering Handover

**Milestone:** Continuous build-integrity enforcement during disposable live acceptance. Package versions: root, API and web `0.87.0`. Continued directly from v0.86. **This is an offline-tested development checkpoint. Production release: NO-GO.**

## Actual source changes

1. `tools/kali-acceptance-v71.cjs`: v0.87 and newer check both the already-existing compiled-artifact policy and the full v0.86 source/build-evidence verifier **before each acceptance stage, immediately before every supervised child command, immediately after each command, and after each stage**. This prevents starting the next command once reviewed API code, web code, migration SQL, build tooling, the npm lockfile, build evidence, or any compiled artifact no longer matches the supervised build. The previous v0.86 behavior checked only after the build and before subsequent stages.
2. The supervisor returns `BUILD_INTEGRITY_DRIFT`, fails the stage, records a count of integrity checks in private structured evidence, and keeps stdout/stderr, authentication credentials, database URLs and secrets out of the evidence. Exceptions in the integrity checker also fail closed. Older v0.71–v0.86 **synthetic compatibility fixture versions** retain their previous contract; the new v0.87+ execution cannot downgrade.
3. Read-only `kali:acceptance:plan:v87` and `kali:acceptance:inspect:v87` disclose whether continuous integrity enforcement applies and whether **current** compiled provenance is ready without running a command or accepting release. `kali:acceptance:run:v87` uses the existing authorization-guarded disposable supervisor, not a new permissive runner.
4. `.github/workflows/ci.yml`: runs `verify:v87` before compilation and repeats the already-existing `acceptance:provenance:inspect:v86` **after** the final disposable PostgreSQL/HTTP tests, thereby detecting source/output drift across the CI integration sequence.
5. `tools/tests-v87/continuous-acceptance-v87.test.cjs`: 30 new tests using real file hashes and synthetic build/child fixtures. Test cases demonstrate that API/web source, SQL, tooling, CI, deploy files, lockfile, compiled JS/CSS, symlinks, deleted output, and altered build records are refused before subsequent child invocation. Tests also cover both existing and new runtime role paths, reviewer failures/exceptions, a successful synthetic sequence and private evidence redaction.
6. Two v0.86 tests previously assumed `acceptance:provenance:inspect:v86` must **always** fail on the authoring host. They now inspect a deliberately incomplete disposable fixture and assert that the CLI exit status matches genuine local build evidence. This avoids a false failure when Kali actually has a reviewed successful build. The underlying provenance verifier was not relaxed.

## Evidence collected

- New v0.87 suite **30/30 passed**. Running against the unchanged v0.86 supervisor implementation: **27/30 failed, 3 passed**, establishing meaningful before/after coverage.
- **47/47** regression suites v0.41–v0.87 passed, **979/979 counted tests passed**, with per-suite logs and machine-readable counts under `test-evidence/v87/`.
- Architecture, syntax/transpilation, import-policy, source contract and Ruby-parsed CI/security contract all passed.
- **27/27 SQL migration files remain byte-for-byte identical** to v0.86; no data schema, API routes, domain model, admin UI or business authorization behavior was modified.
- Limited source-snapshot credential scan passed (see security report for exact count). This is not a history scan.
- Real `npm run build` **FAILED** on unavailable Node/NestJS dependencies and type declarations. No authentic root `package-lock.json`; registry unavailable. PostgreSQL/PostGIS, Docker/ClamAV and live API/browser acceptance are unavailable. The local full build, SQL concurrency and release/production gates remain unverified and **BLOCKED**.

## On trusted connected Kali Linux

```bash
npm run verify:v87
npm run verify:architecture
npm run verify:syntax
npm run build:imports:v80
npm run verify:ci:v53
npm run kali:acceptance:plan:v87
npm run kali:acceptance:inspect:v87
# Only if the checkout lacks an authentic reviewed lockfile:
ASSETTRUST_V55_CREATE_LOCKFILE=YES npm run lockfile:generate:v55
npm run lockfile:check:v55
ASSETTRUST_V68_BUILD_CONFIRM=YES npm run build:acceptance:run:v68
npm run acceptance:provenance:inspect:v86
# Prepare only a fresh disposable local PostGIS fixture, with no customer data:
ASSETTRUST_V70_LOCAL_CONFIRM=YES npm run kali:integration:prepare:v70
ASSETTRUST_V71_ACCEPTANCE_CONFIRM=YES ASSETTRUST_V70_LOCAL_CONFIRM=YES npm run kali:acceptance:run:v87
npm run acceptance:provenance:inspect:v86
```

Follow `V87_KALI_VALIDATION.md` before any mutating command; setting up the disposable role, containers and ClamAV must follow the existing v70 runbook. The v0.87 supervisor itself executes the supervised build again before any live step. Preserve and review original source history and lockfile. The local commands are not safe to direct at production databases.

## Security limitations and next blockers

The new gate verifies **local file consistency at specific checkpoints**, not continuously inside a running child process, not immutable signed provenance, not host compromise, and not third-party reproducibility. The tests simulate subprocesses; **no real npm install, compiled server, PostgreSQL or live HTTP acceptance was executed here**. Source integrity evidence can be forged by a malicious actor with full write access to both the build host and evidence. The remaining mandatory release gates include authentic install/compile, real concurrent MFA/auth/asset/business/tenant tests using restricted PostgreSQL roles, malware scan, full Git-history secret scanning/rotation, SAST/DAST/dependency audit, HTTPS/SSH/RBAC, server-authoritative financial verification, backup restore and rollout/rollback rehearsal. Do not approve production until these pass.
