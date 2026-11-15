# AssetTrust v0.71 — Supervised Kali End-to-End Acceptance

**Checkpoint:** 12 November 2026 · **Source base:** v0.70 · **Production status:** **NO-GO**

## Milestone delivered

v0.70 provided isolated PostGIS/ClamAV and individually guarded Kali commands, but a user could invoke them out of order and a failed operation returned a generic error without a persistent per-stage explanation. v0.71 adds a **single guarded acceptance supervisor**, with a real build-first dependency gate and a private, structured record of the first failing stage. It is an executable orchestration feature, not a claim that the real database tests have run.

**Added:**
- `tools/kali-acceptance-v71.cjs`: `--plan`, `--inspect` and double-confirmed `--run`.
- `tools/tests-v71/kali-acceptance-v71.test.cjs`: 21 dependency-free tests of ordering, failure isolation, secrets, build provenance, permissions and output.
- `npm run kali:acceptance:plan:v71`, `npm run kali:acceptance:inspect:v71`, `npm run kali:acceptance:run:v71` and `npm run verify:v71`.
- CI post-install test registration, version consistency updates, these handover documents and checked evidence.

The supervisor executes **seven ordered stages**, stopping on the first failure:
1. Authentic `npm ci` / dependency audit / API+React compilation / build artifact checks, using the v0.68 supervised build runner.
2. Isolated loopback PostGIS container startup (v0.70).
3. Local ClamAV container startup.
4. Apply and check all 27 reviewed SQL migrations.
5. Provision a non-owner, non-BYPASSRLS runtime role, unless an existing private v0.70 role is present (reused role must still pass next stage).
6. Perform ClamAV, schema ledger, runtime privilege and exact PostgreSQL RLS-policy live checks.
7. Execute the identity-bound compiled API and five authenticated HTTP/PostgreSQL acceptance suites.

All database-mutating actions require **both** `ASSETTRUST_V70_LOCAL_CONFIRM=YES` and `ASSETTRUST_V71_ACCEPTANCE_CONFIRM=YES`, and refuse production mode. Build subprocesses intentionally do **not** inherit database secrets, authentication keys, E2E mutation permissions or integration-operation confirmations. After the build child returns success, the supervisor separately requires v0.68 build evidence with a matching version, all six successful build stages, and matching source-manifest and lockfile hashes, plus the compiled artifact policy. It cannot treat a simple zero exit code as accepted.

The supervisor writes exactly one **owner-only (0600)** JSON evidence report in `.assettrust-local/v70/evidence/`, inside the existing **0700** local private directory. Symlinked or group/world-accessible evidence directories are refused; existing reports cannot be overwritten. The JSON records step name, exit code, bounded error category, timestamps, and release blocking; it never contains raw subprocess output, URLs, credentials, tokens, row IDs or raw server logs. A passing local acceptance is labeled `ACCEPTANCE_COMMANDS_PASSED_RELEASE_BLOCKED`, **never** production-ready.

The existing `compose.integration-v70.yaml` and its SHA-256 checked v0.70 contract remain unchanged. **Important:** it uses the existing v0.70 *named Docker volume*. Do not generate different credentials for an already-initialized v0.70 database volume; inspect that disposable project and preserve the original private credentials. Never delete or reinitialize any volume containing needed records.

## Actual verification in this authoring environment

| Check | Recorded result |
|---|---|
| New v0.71 offline tests | 21/21 passed |
| Version suites v0.41–v0.71 | 31/31 passed; 503 TAP cases counted |
| Architecture / TS+TSX syntax / Vite source graph | Passed |
| GitHub Actions workflow validation | Passed |
| Limited current-source secret scanner | Passed, 3,265 files checked; zero high-confidence matches |
| Read-only build acceptance inspector | Correctly blocked: authentic lockfile absent |
| Full `npm run build` | Failed because NestJS/Node dependencies and type definitions are missing |
| Actual Docker/PostGIS/ClamAV startup | **NOT RUN** (services unavailable) |
| Compiled, authenticated HTTP + browsers | **NOT RUN** |
| Canonical Git-history secret scan | **NOT VERIFIED** (original `.git` history absent) |

This milestone **does not fix the missing genuine lockfile or demonstrate a live build**; those must be resolved on trusted, connected Kali. No SQL migrations, protected RLS predicates, authentication code, tenancy boundaries, payment logic or admin-control permissions changed here.

## Handover / next action

Use `V71_KALI_VALIDATION.md`. Perform source inspection and generate/review the authentic lockfile on Kali; prepare an independent disposable v0.70 test fixture only after checking for existing volumes. Run v0.71 once with the two explicit confirms, then inspect the private report for the **first failing stage**. Correct actual errors, rerun and preserve redacted evidence. Continue to final browser workflows, original Git-history scanning, dependency remediation, backup/restore, TLS, adversarial tests, admin MFA, tenant-isolation tests and manual security signoff before any production launch. DDD, TDD, SOLID, Clean Architecture and security-by-design are required at all future milestones.
