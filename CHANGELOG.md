## v0.86 — Supervised build-output provenance and source consistency

All emitted API/web files are hashed and checked against reviewed source, manifests, genuine lockfile and ordered supervised build evidence before live acceptance. 34 new offline tests pass; production remains NO-GO. See `CHANGELOG_V86.md`.

## v0.82 — Role-mandatory administrator MFA and session-specific proof (12 November 2026)

Founder and legacy administrators now require MFA; elevated tokens require verified session-specific proof. Protected refresh and MFA disable paths are fail-closed. Synthetic HTTP acceptance tests enroll administrators rather than bypass protections. 45 tests and 42 version suites pass offline; real compile, PostgreSQL and independent security release remain **NO-GO**. See `CHANGELOG_V82.md`.

## v0.81 — Runtime startup safety and isolated test APIs (12 November 2026)

Fail closed on missing login abuse secret in every environment, invalid `PORT`, inconsistent CORS allowed origins, and unsafe disposable API markers/binds. 35 new tests, 41/41 recent version suites passed offline. **Production NO-GO**. See `CHANGELOG_V81.md`, `V81_HANDOVER.md` and `V81_KALI_VALIDATION.md`.

## v0.80 — Dependency import and build-path contract

See `CHANGELOG_V80.md`. Direct Express declaration, source import policy, 17 new tests and CI integration. Source-only milestone; production NO-GO.

## v0.79 — Current-role read boundary (12 November 2026)

- Current database membership and role checks protect dashboard, audit and integration endpoints. Case reports read protected content only within the permission-locked tenant transaction.
- Adds 23 regression tests. Complete live build and release validation still blocked. See `CHANGELOG_V79.md`.

## v0.78 (2026-11-12)

Non-blocking migration advisory lock, error recovery and read-only PostgreSQL acceptance. See `CHANGELOG_V78.md`.

## v0.74 — Current-role document/grant authorization

See [CHANGELOG_V74.md](CHANGELOG_V74.md). Stale administrator role claims no longer authorize document lists or grant administration. Full PostgreSQL/production acceptance remains outstanding.

## v0.73 (2026-11-12)

Transactional document read authorization and supervised revocation HTTP acceptance; details in `CHANGELOG_V73.md`. Development checkpoint only — production NO-GO.

## v0.72.0 — Transaction recovery, bounded DB operations and current-version build acceptance (12 November 2026)

- Live API Pool now applies immutable connection, statement, query, lock and idle-transaction bounds.
- Failed BEGIN/COMMIT/ROLLBACK transaction paths discard unsafe pooled PostgreSQL clients, preserving original errors.
- Supervised acceptance recognizes current package version and requires successful v72 regression evidence.
- Added 21 fault-injection and build-provenance tests; 32 version suites (v41–v72) passed offline.
- No migrations or RLS policies changed. Live build/integration and final security release remain BLOCKED.

## v0.71.0 — Supervised disposable Kali acceptance (12 November 2026)

- Added one-command build-first supervised PostGIS/ClamAV/migration/runtime-role/RLS/authenticated-HTTP acceptance, requiring dual explicit local confirmation.
- Added private 0600 structured first-failure reports with no raw credentials or child output; non-production status is permanent.
- Rejects a successful child process without reviewed and matching v0.68 build evidence. Removes mutation opt-ins and secrets from npm build subprocesses.
- Added 21 new tests, updated CI coverage and source-version compatibility, with 31/31 recent suites green.
- No production build or live PostGIS was possible in the authoring environment; production remains **NO-GO**.

## v0.68.0 — supervised build acceptance and artifact provenance (2026-11-12)
- Introduced a fail-closed build-only acceptance runner with explicit nonproduction authorization, authentic lockfile requirements, dependency audit, real compilation sequence and private error evidence.
- Added API/web artifact freshness and checksum verification, guards against source manifest or lockfile tampering, and safer environment handling for npm subprocesses.
- Added 25 regression scenarios and expanded the CI checks without changing any of the 27 SQL migrations.
- Release remains **NO-GO** because the trusted dependency installation, real PostgreSQL/PostGIS, browser flows and security release checks have not yet been verified.

## v0.66 — Continuous database isolation readiness and two API contract

- Added runtime RLS/role/policy rechecks to every `readyz` call with fail-closed schema/result contract.
- Added UI policy status and strict verification before showing READY.
- Added guarded, redacted two-loopback-API contract acceptance and wired it to supervised v0.42 test/CI.
- Added 25 v0.66 tests; source-only regression matrix passed; production NO-GO pending authentic build and live security evidence.

# v0.63 - PostgreSQL RLS Policy Integrity

New fail-closed 16-policy startup contract and read-only live checker; fixed preinstall/postinstall CI test ordering. 31 new tests and 61 version suites pass offline; production release blocked. See `CHANGELOG_V63.md`.

# v0.62 — Operations RLS and private notifications

Added migration 027 (five tables and 12 composite tenant FKs), recipient-scoped notification reads, dynamic RLS runtime inventory and a guarded two-org PostgreSQL test. Offline source checkpoint; production NO-GO. See CHANGELOG_V62.md.

# AssetTrust v0.59 — Functional tenant CRUD security validation

## Deliverable

The v0.58 two-organization contract proved that restricted PostgreSQL logins could not see or mutate other tenants' seeded rows. It did not show that legitimate inserts, updates and deletes would succeed. A blanket read-only policy could therefore pass parts of the negative tests while breaking the product.

v0.59 adds a **second guarded integration test** (`tools/e2e-pg-runtime-tenant-crud-v59.mjs`) that seeds two synthetic organizations and verifies the following through an independent non-superuser runtime database connection:

- Four authorized INSERT operations succeed for assets, verification cases, evidence and document metadata, with real same-tenant foreign-key relationships.
- Authorized UPDATE and DELETE each affect exactly one matching record in every table; authorized inserts can be read back.
- Cross-organization UPDATE and DELETE return zero affected rows; cross-organization INSERT is rejected.
- Tenant context resets following ROLLBACK **and** COMMIT, not just after a failed transaction.
- Transient writes are absent after the test transaction; seeded records are cleaned up on normal exit.
- Role ownership, `BYPASSRLS`, superuser and missing `FORCE ROW LEVEL SECURITY` controls are rejected by the prerequisite role contract.

Every live test is restricted to a confirmed loopback `assettrust_ci` or `assettrust_test` database, requires separate operator/runtime credentials and explicit mutation authorization, and refuses to run otherwise.

## Other engineering corrections

- The supervised database validation plan now orders tests by their security dependencies: restricted role v0.57 → seeded isolation v0.58 → functional CRUD v0.59, before two-API and HTTP suites. Previously alphabetic sorting placed CRUD before the seeded isolation check.
- The supervised runner now requires `ASSETTRUST_V59_CRUD_CONFIRM=YES` **before** any database action.
- GitHub Actions checks the new suite before `npm ci` and includes the live CRUD contract immediately after v0.58. The parser-backed workflow security check passes.
- Package and workspace versions are advanced together to `0.59.0`. No SQL migrations or domain policy changes have been introduced.

**Scope limitation:** RLS currently applies to seven selected tables, not the entire user, audit, membership, payment or administrative data model. A database role that can execute arbitrary `set_config()` calls is not, by itself, a complete authorization boundary against SQL injection; service-side authorization, parameterized SQL, database least privilege and full review remain mandatory.

---

# AssetTrust v0.58 - Seeded restricted-runtime tenant isolation verification

Dependency-free security tests and CI workflow pass. A new, explicitly authorized live PostgreSQL contract seeds two organizations and probes four core RLS tables via a separate restricted DB login; **not run here**. Supervised release DB target checks now refuse operator-only credentials, and local provisioning does not leak generated passwords to the terminal. Existing 25 migrations unchanged. See `CHANGELOG_V58.md`. Production NO-GO.

---

# AssetTrust v0.57 - Non-bypass CI runtime database role

Date: 11 November 2026. Development checkpoint. **Release NO-GO**.

## Confirmed issue addressed

The GitHub Actions PostgreSQL service uses a database operator login with superuser privileges for migrations and fixture creation. Earlier row-level security contracts deliberately switched to temporary restricted roles, but the real API smoke processes still inherited that superuser URL. As a result, those API smoke tests did not reliably exercise the database policies that a production-style non-bypass application role must obey.

## Source changes

- `tools/runtime-role-policy-v57.cjs`: validates distinct operator and runtime PostgreSQL URLs on the same approved disposable loopback DB; rejects superuser/operator login reuse for CI API startup; verifies seven RLS table policies and denies an unreviewed runtime role.
- `tools/provision-ci-runtime-role-v57.mjs`: creates a disposable, random-password `assettrust_v57_ci_runtime` login with `NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB`. Grants broad application DML on **CI only**; this does not establish production least-privilege grants. Appends the masked connection URL to the ephemeral GitHub Actions environment file; refuses to run outside explicitly authorized local CI targets.
- `tools/test-ci-runtime-role-v57.mjs`: read-only **live** contract, checking actual runtime role flags, nonownership, all seven `FORCE ROW LEVEL SECURITY` flags, and denial of unscoped reads. Requires installed `pg` and running disposable PostgreSQL.
- `apps/api/src/database.ts`: applies the existing production DB-role and RLS startup rejection to CI HTTP applications when `ASSETTRUST_V57_ENFORCE_RUNTIME_ROLE=YES`.
- `tools/e2e-two-api-v42.mjs`, `tools/ci-live-integration.mjs`: API child processes receive separate restricted credentials; fixture/test orchestration retains the disposable database operator URL. Runtime URL is validated before any spawn in CI. Sensitive runtime URLs are redacted from bounded log excerpts.
- `.github/workflows/ci.yml`: provisions and checks restricted runtime after schema migrations and before HTTP integration tests; enforces the separation in CI.
- Added 20 dependency-free regression tests. All workspace manifests now report v0.57.0. Existing 25 SQL migrations are unchanged.

## Limitations

No npm registry DNS access here (EAI_AGAIN), no authentic lockfile, no installed NestJS/pg dependencies and no disposable PostgreSQL service. Consequently, **the CI runtime role has not been provisioned or proven live here**. No completed full build, browser E2E, Git-history scan, ClamAV service verification or penetration test. This checkpoint cannot authorize deployment.

---

## v0.56 - 11 November 2026

Fixed missing `apps/web/index.html` Vite entry; added pre-install source graph/HTML validation and post-build frontend/server-asset security policy; 20 tests, 54 version suite passes, CI/release-runner integration. No SQL migrations. **Production NO-GO.** See `CHANGELOG_V56.md`.

## v0.55 - 11 Nov 2026

See `CHANGELOG_V55.md`: guarded real lockfile bootstrap, health version correctness, external original Git history in supervised validation, 16 new tests and 53/53 historical suites passing. No migrations. Live build and production release blocked.

## v0.54 - Git-history release gate
- Batched historical secret scanner with commit-message and locally retained reflog coverage.
- Secure original-clone targeting (`--repo`) with no secret-value output; 15 real-Git integration tests.
- CI requires v0.54 checks and complete source history audit; no migration changes.
- Release remains NO-GO pending genuine npm build, PostgreSQL, antivirus and deployment evidence.

## v0.53 (2026-11-11) — Validated CI workflow and complete supervised release evidence

Fixed invalid GitHub Actions YAML, added Ruby/Psych workflow syntax/coverage enforcement before npm install, extended supervised Kali release plans to include two real API processes and HTTP integration, and added strict local evidence review. See `CHANGELOG_V53.md`; production release remains NO-GO.

## v0.51.0 - 11 Nov 2026

Supervised release validation, npm dependency provenance, disposable database test preflight, and fail-closed evidence. See `CHANGELOG_V51.md`. No new SQL migration; production NO-GO.

## v0.50 - Confidential document metadata RLS (11 Nov 2026)

See `CHANGELOG_V50.md` for database policy, tenant scoping, CI and verification. Production NO-GO.

# v0.49 (11 November 2026): RLS for assets and cases

- Adds migration 024, FORCE RLS policies on assets and verification_cases.
- Refactors case/asset access through transaction-local tenant scopes; retains application authorization.
- Adds two-tenant PostgreSQL contract, CI coverage and production startup guard.
- Production release still NO-GO; see CHANGELOG_V49.md and V49_SECURITY_REPORT.md.

# v0.47 - Core Tenant Relationship Integrity

See `CHANGELOG_V47.md`. No production approval.

## v0.46 - First-stage, fail-closed database tenant isolation (2026-11-11)
- Added **021_pdf_layout_rls.sql** with ENABLE + FORCE RLS on the three private PDF layout administration tables.
- Added transaction-local, parameterized tenant context for admin layout routes and confidential report-recipient PDF rendering.
- Production startup rejects superuser/BYPASSRLS/CREATEROLE/CREATEDB database roles, missing RLS, or a runtime database role that owns protected tables.
- Added guarded disposable PostgreSQL RLS test with non-bypass role, two synthetic tenants, zero-tenant default denial, cross-tenant read denial, and write denial.
- Added 13 offline v0.46 checks; updated existing v0.41/v0.45 tests to support future append-only versions.
- **No full database RLS claim**. Production release remains blocked pending real DB execution and other gates.

# v0.45 - Shared account login throttle (11 November 2026)

See `CHANGELOG_V45.md`, `V45_SECURITY_REPORT.md` and `TEST_EVIDENCE_V45.md`. Database-backed 10-attempt/15-minute account limits, HMAC privacy, MFA-safe clearing and release checks added. Not production approved.

# v0.44 - Security password recovery and single-use reset (11 November 2026)

See CHANGELOG_V44.md, V44_SECURITY_REPORT.md, V44_KALI_VALIDATION.md. This release is NOT production approved.

## v0.43 - Security hardening and finalization gate (11 November 2026)

See `CHANGELOG_V43.md`, `V43_ASSETTRUST_SECURITY_REPORT.md`, and `SECURITY_FINALIZATION_STANDARD.md`. Targeted CSRF origin check, private production bind, security policies and source scans added. **NO-GO: no full Git-history scan or clean build.**

## v0.42 — Two real API process smoke and guarded Kali validation (2026-11-11)

- Added two-process disposable test runner and fail-closed policy; extended CI suite completeness, automated Kali validation and regression evidence. Production readiness still blocked; details in `CHANGELOG_V42.md`.

## v0.41 — Release engineering / CI coverage (11 November 2026)

See `CHANGELOG_V41.md`, `V41_RELEASE_ENGINEERING.md`, and `TEST_EVIDENCE_V41.md`. CI coverage drift from v0.35 was corrected, nine new tests and an opt-in multi-session PostgreSQL contract were added. **Production blocked on live gates and missing authentic lockfile.**

## v0.40 — Shared recipient access hardening

See `CHANGELOG_V40.md`. Includes distributed failed-attempt limits, tenant security warnings and read-only release preflight. Offline-tested; not production ready.

## v0.39 — Private recipient PDF sharing

See [CHANGELOG_V39.md](CHANGELOG_V39.md). Added two-admin approval, independent bearer credentials, usage limits, expiry, revocation and redemption audit.

## v0.38 — Organization-approved PDF report layouts (11 November 2026)

See `CHANGELOG_V38.md`. Adds dual-admin, revisioned organization PDF presentation controls, approved-layout exports and migration 016. Prior evidence remains immutable. Not production-ready.

# AssetTrust change log

## v0.3 — 6 November 2026

- Added evidence submission/review/acceptance workflow with a second reviewer identity and notes.
- Hardened stage advancement to reject unreviewed or rejected evidence.
- Protected sensitive review stages with professional role gates and prevent review of one's own submission.
- Added local-only E2E test runner and a CI pipeline skeleton.
- Hardened private document metadata failure handling and linked access checks.
- Restricted quotation lifecycle to avoid unilateral customer acceptance statuses.
- Protected flagged closed cases from accidental clearing after a dispute resolution.
- Added React review controls, user interface previews and evidence governance/QA documentation.
- No external land registry, blockchain, payments or professional accreditation integrations activated.

## v0.2 — Prior checkpoint

- Organizational workspaces, invitations, assets, case assignments, tasks, disputes, reminders, quotes, access grants, notifications, responsive UI.

## v0.37
Private PDF report export, paired detached Ed25519 receipt, offline PDF-byte verification utility, admin download action and service/cryptographic regression tests. See `CHANGELOG_V37.md`. Production release remains blocked.

## v0.52 — malware-screened document uploads (2026-11-11)
- Added local ClamAV INSTREAM scanner application port and fail-closed NestJS adapter for the authenticated document upload endpoint, before encrypted blob storage and metadata insert.
- Added production Unix-socket configuration guard, 13 offline protocol/security tests, CI real-daemon EICAR contract and supervised release-validator integration.
- Preserved existing 25 migration fingerprints; no new SQL migration. Actual ClamAV detection, dependency build and PostgreSQL tests remain unverified; production release blocked.

## v0.60 - Restricted CI PostgreSQL privileges
- Revoke write permissions on the schema ledger and audit-history rewrite permissions for the disposable API role.
- Add fail-closed privilege audit, explicit repair for existing test roles and 15 new tests.
- Run privilege checks before seeded multi-tenant integration tests.
- Offline tests green; real PostgreSQL and reproducible builds not yet verified. Production NO-GO.

## v0.61 — Append-only audit-log tenant RLS (development checkpoint)

- Appended immutable migration `026_audit_events_rls.sql`: ENABLE + FORCE RLS on audit events; tenant-scoped `SELECT` and `INSERT` policies only. Runtime `UPDATE`/`DELETE` remains revoked by the v0.60 role grant policy.
- Scoped `AuditService.write` to the active tenant inside its transaction before reading the hash-chain head or appending an event. Scoped audit list/verify and local integration proof reads; scoped operator platform-admin bootstrap audit append.
- Production startup and restricted CI role now check eight RLS tables. Added a guarded, seeded two-organization PostgreSQL audit test using separate operator/runtime connections; not executed without a live disposable PostgreSQL database.
- Added a read-only SQL operator audit, CI and supervised-runner coverage, regression tests and an upgrade runbook. Existing 001–025 migrations remain unchanged.
- **NO-GO**: npm lockfile and full builds unavailable here; live PostgreSQL, ClamAV, user journeys and deployment validation pending. This is not government land-title certification nor third-party blockchain notarization.

## v0.64 — 11 November 2026

Added an evidence-driven, fail-closed Kali runtime integration runner and 15 initial tests; expanded CI coverage without altering SQL migrations or public APIs. See `CHANGELOG_V64.md`. Release decision remains NO-GO pending connected, live evidence.

## v0.65.0 — Trusted runtime readiness and diagnostics (2026-11-11)
- `/readyz` now exposes the running API version and verified migration count only when PostGIS, required tables and all 27 migration checksums match.
- Replaced stale v0.11 / 7-migration deployment dashboard claims with backend-derived values; optional integration status failure no longer falsifies database readiness.
- Added local-only, nonmutating, credential-safe runtime diagnosis, 0600 optional evidence, SHA-256 source ledger comparison and symlink guards.
- Added 16 new v65 security/readiness tests and registered v65 in the CI version matrix. No migrations or authorization/RLS permissions changed. Production remains NO-GO pending connected Kali evidence.

## v0.67.0 — Readiness concurrency and admin evidence integrity (12 November 2026)

- Coalesce simultaneous `SchemaProbe.check()` executions using a framework-free single-flight coordinator; no successful or failed readiness result is cached after the in-flight request settles.
- Add strict frontend readiness response parsing that requires service identity, version, database/PostGIS/migration/RLS fields and positive verified counts.
- Abort stale readiness requests across refreshes, role changes and unmounts; use an 8-second browser readiness deadline; prevent outdated optional integration results from overwriting current evidence.
- Add 19 new tests, update v65/v66 test harness compatibility and include `verify:v67` after `npm ci` in the CI workflow.
- Offline source/regression validation passes; genuine full app build and live DB, browser and security release tests remain BLOCKED. Production NO-GO.

## v0.87.0

Continuous build-integrity checks before and after each disposable Kali acceptance command; final post-integration CI provenance review; 30 new regression tests. Offline-tested checkpoint only, production NO-GO. See `CHANGELOG_V87.md`.
