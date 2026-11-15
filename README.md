> **v0.86 checkpoint:** Full source/output build-provenance verification now gates disposable Kali and CI acceptance. 46/46 offline suites pass; real compilation and PostgreSQL remain outstanding. See `V86_HANDOVER.md`.

## v0.85 — Secure build integrity and loopback-safe development (12 November 2026)

The actual source changes and tests are documented in `V85_HANDOVER.md` and `TEST_EVIDENCE_V85.md`. New development API and Vite servers default to `127.0.0.1`; optional LAN binding requires explicit `ASSETTRUST_ALLOW_LAN_DEV=YES` and a configured bind host. The supervised build runner now verifies an in-memory fingerprint of protected application source, SQL and build tooling between each npm step to detect postinstall tampering.

Quick offline checks: `npm run verify:v85 && npm run verify:architecture && npm run build:source:v56`. On connected trusted Kali, obtain a genuine reviewed npm lockfile and run `ASSETTRUST_V68_BUILD_CONFIRM=YES npm run build:acceptance:run:v68` to execute `npm ci`, dependency audit, API/web build and artifact verification. Real PostgreSQL/HTTP/browser acceptance and independent release gates are still mandatory. **Source-development only; production NO-GO.**

# AssetTrust v0.84 — Atomic MFA Lifecycle Hardening

The v0.84 source fixes stale-password MFA removal, session-liveness verification on MFA step-up and enrollment confirmation, and transaction-scope rollback on revoked sessions. 28 new offline service tests and 44/44 version suites (872 cases) passed. **Production NO-GO:** genuine npm lockfile and dependencies, full compilation, live PostgreSQL/HTTP/browser tests and final independent security gate remain outstanding. Read `V84_HANDOVER.md`, `V84_KALI_VALIDATION.md` and `ASSETTRUST_V84_SECURITY_REPORT.md`.

**v0.83 Credential Lifecycle Hardening:** Login now rechecks the verified password digest inside a user-row-locked transaction before issuing a session or MFA challenge. Changing a password invalidates outstanding MFA login challenges and unused password-reset links in the same transaction. See `V83_HANDOVER.md` and `V83_KALI_VALIDATION.md`. Production release remains blocked until live validation.

## Current source checkpoint: AssetTrust v0.82 — Mandatory Administrator MFA

New and legacy `ORG_ADMIN` accounts must complete authenticator MFA; access requires proof for the current authenticated session, not just an enabled credential on the account. Synthetic HTTP integration journeys were upgraded to perform real MFA enrollment rather than bypass it. 45 new tests and 42/42 version suites passed offline; the authentic lockfile, actual API+web compilation, live PostgreSQL tests and final release gate remain blocked. **PRODUCTION NO-GO.** See `V82_HANDOVER.md`, `V82_KALI_VALIDATION.md`, and `ASSETTRUST_V82_SECURITY_REPORT.md`.

## Current source checkpoint: AssetTrust v0.81 — Runtime startup hardening

v0.81 rejects a missing login-rate-limit secret before server startup, verifies bind/port and uses normalized CORS origins for the actual listener. Marked disposable test APIs must run in test mode on loopback. Validate offline with `npm run verify:v81`. **This does not establish a successful live build or production readiness.** See `V81_KALI_VALIDATION.md`, `V81_HANDOVER.md`, and `ASSETTRUST_V81_SECURITY_REPORT.md`.

## v0.80 — Dependency contract and build-path check

API Express type imports now have a direct `express` dependency and use `import type`. Run `npm run build:imports:v80` to reject undeclared workspace imports, and `npm run verify:v80` for the 17 new guard tests. A genuine lockfile, npm ci, compiled API/web output and live PostgreSQL security acceptance remain mandatory; see `V80_HANDOVER.md` and `V80_KALI_VALIDATION.md`. **Production release: NO-GO.**

> **v0.79 checkpoint:** Live-role authorizations for dashboard/audit/integrations, plus same-transaction confidential case reports. Offline regressions passed; live application build and security release gate remain **NO-GO**. See `V79_HANDOVER.md` and `V79_KALI_VALIDATION.md`.

## Current checkpoint: v0.78 — Fail-fast database migration recovery

The source package now uses non-blocking migration locks, explicit uncertain-transaction handling and a guarded read-only PostGIS lock acceptance test. Offline version regressions v0.41–v0.78 pass. **This is not a deployed application**: genuine dependencies, full compilation, live PostgreSQL/HTTP/browser acceptance and final independent security signoff are still required. See `V78_HANDOVER.md`, `V78_KALI_VALIDATION.md` and `ASSETTRUST_V78_SECURITY_REPORT.md`.

## v0.77 development checkpoint — cross-case dispute integrity

Dispute creation and finalization now serialize on the shared asset row; clearing an asset's dispute flag requires zero outstanding disputes across all its cases. `npm run verify:v77` runs offline regression tests; `npm run kali:disputes:plan:v77` and the guarded `kali:disputes:run:v77` support real PostgreSQL testing on an explicitly authorized disposable local instance. **Not production approved:** genuine npm lockfile, full build, live RLS, HTTP/browser acceptance and final security audit remain outstanding. See `V77_HANDOVER.md` and `V77_KALI_VALIDATION.md`.

> **v0.76 update:** See `CHANGELOG_V76.md`, `V76_HANDOVER.md`, and `V76_KALI_VALIDATION.md`. Production release remains **NO-GO** pending authentic lockfile, builds, live PostgreSQL and security acceptance.

> **v0.74 checkpoint:** Current-role document list and asset-grant admin authorization hardening. See `V74_HANDOVER.md` and `V74_KALI_VALIDATION.md`. Production release remains NO-GO.

> **Latest checkpoint: AssetTrust v0.73.0 (12 November 2026)** — transactional encrypted document downloads with current-permission row locks and a guarded end-to-end revocation test. Source/mocked tests pass; live Kali build and PostgreSQL verification remain **NO-GO**. Start with `V73_KALI_VALIDATION.md` and `V73_HANDOVER.md`.

> **Latest development checkpoint: v0.72 (12 November 2026)** — runtime transaction recovery and version-aware supervised acceptance. Begin with `V72_KALI_VALIDATION.md`. **Production: NO-GO** until the real build, PostgreSQL, HTTP and final security gates pass.

> **Latest checkpoint: AssetTrust v0.71.0 (12 November 2026).** Adds a single, double-confirmed build-first Kali integration supervisor, non-leaking first-failure evidence, build provenance verification and 21 new offline tests. Live dependency install, compilation and PostgreSQL-backed acceptance remain unverified here. **Production: NO-GO.** See `V71_HANDOVER.md` and `V71_KALI_VALIDATION.md`.

> **Latest checkpoint: AssetTrust v0.69.0 (12 November 2026).** Added a supervised, authenticated two-organization administrator/reviewer HTTP acceptance journey and CI integration. Offline verification passes, but real build and PostgreSQL integration remain unverified. **Production: NO-GO.** Start with `V69_HANDOVER.md`, `V69_KALI_VALIDATION.md`, `TEST_EVIDENCE_V69.md` and `ASSETTRUST_V69_SECURITY_REPORT.md`.

> **v0.63 update (11 Nov 2026):** production API startup now fails if any expected tenant/recipient RLS policy is missing, extra or changed. A read-only restricted-role catalog checker is included. Source-only tests pass, but npm lockfile/full build/live PostgreSQL/browser validation remain release blockers. See `V63_KALI_VALIDATION.md`.

# AssetTrust v0.62 — Operational RLS and private inboxes (development only)

**Production NO-GO.** Migration 027 adds RLS to tasks, disputes, reminders, quotes and recipient-specific notifications, plus tenant-matched foreign keys. A new disposable PostgreSQL contract and preflight are prepared; not executed live here. Read `V62_KALI_VALIDATION.md`, `V62_SECURITY_REPORT.md`, `V62_HANDOVER.md`, `TEST_EVIDENCE_V62.md` before applying migrations. An old API must not remain running when migration 027 is activated.

# AssetTrust v0.61 — Tenant-isolated audit ledger (development only)

**Production release: NO-GO.** New migration `026_audit_events_rls.sql` enables and forces row-level security on `audit_events`. Audit writes, verification, listing and local proof routes now use transaction-local organization scope; a disposable two-organization RLS test is included for execution on Kali Linux. The older 25 migrations are unchanged. Do not deploy migration 026 against an old running API; use a coordinated maintenance/upgrade plan and restore-tested backup. See `CHANGELOG_V61.md`, `V61_KALI_VALIDATION.md`, `TEST_EVIDENCE_V61.md` and `V61_SECURITY_REPORT.md`.

AssetTrust v0.60 — CI runtime grant hardening (not production approved)

> **Current checkpoint: v0.59.0 — PRODUCTION NO-GO.** Dual-organization PostgreSQL contract now tests both authorized CRUD and forbidden cross-tenant access through a restricted runtime role; live execution remains outstanding. See `V59_KALI_VALIDATION.md`, `TEST_EVIDENCE_V59.md`, `V59_SECURITY_REPORT.md`.

> **Current checkpoint: v0.58.0 (development; production NO-GO).** Added real two-organization restricted-login RLS integration contract and fail-closed Kali/CI release checks. See `V58_KALI_VALIDATION.md`, `TEST_EVIDENCE_V58.md` and `V58_SECURITY_REPORT.md`. No live PostgreSQL run or successful build in this environment.

> Current checkpoint: **v0.57.0**. See `CHANGELOG_V57.md`, `V57_KALI_VALIDATION.md` and `V57_SECURITY_REPORT.md`. Production **NO-GO**.

> **v0.56 security build checkpoint:** The missing Vite HTML entry has been added. Run `npm run build:source:v56` before dependency install and `npm run build:artifacts:v56` after a real successful build; see `V56_KALI_VALIDATION.md`. Production release remains **NO-GO**.

# AssetTrust v0.55 - Authentic lockfile bootstrap and release integrity

**Development checkpoint only (NO-GO for production).** v0.55 adds an explicitly authorized real-npm lockfile bootstrap for connected Kali, fail-closed supply-chain checks, dynamic API health version, original-Git-clone history scanning in supervised validation, and CI checks before npm installation. The authentic npm lockfile and live build remain blocked here; see `V55_KALI_VALIDATION.md`, `TEST_EVIDENCE_V55.md`, `V55_HANDOVER.md`, and `V55_SECURITY_REPORT.md`.

# AssetTrust v0.54 - Git history security checkpoint

This checkpoint updates the historical credential scanner. See `V54_HANDOVER.md`, `V54_KALI_VALIDATION.md` and `V54_SECURITY_REPORT.md`. The new release scan uses `npm run security:scan:v54`; it must run on an original complete Git clone, not this archive. **Production: NO-GO.**

> **Current milestone: AssetTrust v0.53 (11 November 2026)** — CI YAML integrity corrected, supervised Kali release plan extended to 88 stages, and an evidence completeness checker added. Offline checks pass; **production release remains NO-GO** pending genuine lockfile, successful build, ClamAV/PostgreSQL/browser and infrastructure tests. See `V53_KALI_VALIDATION.md` and `V53_SECURITY_REPORT.md`.

> **v0.51 security-release status:** Development checkpoint only. Reproducible install/build and live PostgreSQL release gates remain blocked until executed on connected Kali. See [V51_KALI_VALIDATION.md](V51_KALI_VALIDATION.md) and [V51_SECURITY_REPORT.md](V51_SECURITY_REPORT.md).

# AssetTrust v0.50 - Confidential Document Metadata RLS

**Development checkpoint only; production NO-GO.** See `V50_SECURITY_REPORT.md`, `V50_HANDOVER.md`, `V50_KALI_VALIDATION.md`, `TEST_EVIDENCE_V50.md`.

# AssetTrust v0.49 - Tenant isolation security checkpoint

**Status: DEVELOPMENT ONLY / NO-GO for production.** v0.49 adds PostgreSQL row-level policies for `assets` and `verification_cases` (migration 024), including transaction-scoped tenant context and a disposable two-tenant contract test. Read `V49_KALI_VALIDATION.md`, `V49_SECURITY_REPORT.md` and `TEST_EVIDENCE_V49.md` before migration. This change is not a live database certification.

---

> **v0.48 SECURITY CHECKPOINT - DEVELOPMENT ONLY:** Adds FORCE PostgreSQL RLS to private case evidence with transaction-scoped tenant context on the evidence, workflow, report and dashboard paths. Four tables total have RLS in this staged rollout (three PDF-layout tables + case_evidence). Assets, cases, documents, users and other private tables are **not** RLS-protected. Do not use with customer data until live PostgreSQL, authentic build, secret history scan and all other release checks pass. See `V48_SECURITY_REPORT.md`, `V48_KALI_VALIDATION.md` and `TEST_EVIDENCE_V48.md`.

# AssetTrust v0.48 - Private Evidence Tenant RLS

> **v0.47 SECURITY CHECKPOINT:** Adds tenant-integrity composite FKs for assets, cases, evidence and documents. Not database-wide RLS. Production NO-GO. See `V47_SECURITY_REPORT.md` and `V47_KALI_VALIDATION.md`.

# AssetTrust v0.47 - Core Tenant Relationship Integrity

> **Development checkpoint. Production: NO-GO.** Three private PDF layout tables are now RLS-scoped, but the rest of AssetTrust is **not yet covered by database RLS**, and live PostgreSQL tests have not been executed in this environment.

Read `V46_KALI_VALIDATION.md`, `V46_RLS_ARCHITECTURE.md`, `V46_SECURITY_REPORT.md`, and `TEST_EVIDENCE_V46.md` before running on existing data. Take a verified database backup first, retain encryption keys, use the original migration ledger, and never baseline to skip migrations.


**Development checkpoint only. Production release blocked.**

This release adds a PostgreSQL-backed, HMAC-keyed account login attempt limit shared by API instances. A reservation occurs *before* password verification. After ten attempts in a 15-minute window, further attempts are blocked, and a pending MFA challenge does not clear the counter. A new unique `LOGIN_ABUSE_PEPPER` is required. See `CHANGELOG_V45.md`, `V45_SECURITY_REPORT.md`, `V45_KALI_VALIDATION.md`, `TEST_EVIDENCE_V45.md`, and `V45_HANDOVER.md`.

The existing v0.44 password recovery, administrator controls, reports, PDF signatures and recipient access remain in the source. The project is **not yet production-ready**: real PostgreSQL, full builds, dependency vulnerability scans, Git history, and end-to-end security testing remain outstanding.

# AssetTrust v0.44 - Security Password Recovery Checkpoint

**Status: DEVELOPMENT ONLY - production security release blocked.**

This checkpoint adds one-time 15-minute password recovery, an HTTPS-only server-side relay adapter, HMAC-keyed request throttling, a new PostgreSQL migration, full session invalidation, and a browser recovery flow. See **V44_SECURITY_REPORT.md**, **V44_KALI_VALIDATION.md** and **V44_HANDOVER.md**. The relay is disabled until independently configured and tested. Prior project functionality and the cross-project final security standard remain preserved.

# AssetTrust Platform - v0.43 security checkpoint

## v0.43 - Final security hardening standard (development checkpoint)

v0.43 adds stricter CSRF origin checks for refresh cookies, local-only default API binding in production, debug-mode rejection, snapshot and history-aware secret-scanning tools, and the mandatory 20-control final security standard shared across all projects. The canonical Git history, genuine npm lockfile, dependency audit and live infrastructure are unavailable here. **Not production ready.** Review `V43_ASSETTRUST_SECURITY_REPORT.md`, `V43_KALI_SECURITY_VALIDATION.md` and `TEST_EVIDENCE_V43.md`.

## v0.42 — supervised dual-API validation (historical checkpoint)

v0.42 adds a fail-closed, disposable-only test that supervises **two real compiled API processes** with distinct health identities against the same loopback PostgreSQL, then checks both reject an unknown recipient share. It is not a real valid-share contention test and was not executed against live PostgreSQL in the checkpoint environment. Use `npm run verify:v42` for offline tests and `npm run run:disposable:v42` on a properly prepared, authorized **test-only** Kali database after generating a genuine lockfile. See `V42_KALI_VALIDATION.md`, `V42_TWO_API_RELEASE_ENGINEERING.md`, and `TEST_EVIDENCE_V42.md`. **Production release remains blocked.**

> **Historical v0.41 checkpoint (release engineering).** CI coverage now includes all version and PostgreSQL contract suites. Read `V41_HANDOVER.md`, `V41_KALI_VALIDATION.md`, and `TEST_EVIDENCE_V41.md`. **NOT production ready:** the authentic npm lockfile, full build, live database and authenticated browser gates remain unproven.

> **Historical v0.40 checkpoint.** Read `V40_HANDOVER.md`, `V40_KALI_VALIDATION.md`, and `TEST_EVIDENCE_V40.md` before executing migrations. The source is **not production-ready**; there is no authentic lockfile or completed live database/browser validation.

> **v0.39 checkpoint:** See `V39_KALI_VALIDATION.md`, `V39_SHARING_ARCHITECTURE.md`, and `TEST_EVIDENCE_V39.md`. A private PDF recipient share needs two administrator approvals and two separately delivered secrets. This is not an official land-title registry.

> **v0.36 development checkpoint:** Signed private JSON evidence-bundle export for authorized administrators; independently pinned Ed25519 public-key verification. Not a signed PDF or government certificate. See `V36_KALI_VALIDATION.md`, `V36_SIGNED_EVIDENCE_ARCHITECTURE.md` and `TEST_EVIDENCE_V36.md`. Release blocked until live build/DB/browser gates pass.

## Historical v0.34 — Report Issuance & Public QR Validation

**Development checkpoint. Not production-ready.** This release adds separately approved private evidence-report issuance, append-only report snapshots, explicit supersession, a same-origin QR reference generated in React, and minimal public record verification. These are **not government land titles, legal ownership certificates, qualified digital signatures, or blockchain notarizations**. See [v0.34 architecture](docs/V34_REPORT_ISSUANCE_ARCHITECTURE.md), [Kali validation guide](docs/V34_KALI_VALIDATION.md), [test evidence](docs/TEST_EVIDENCE_V34.md), and [changelog](CHANGELOG_V34.md).

Mandatory engineering principles: **DDD, TDD, SOLID, Clean Architecture, Security by Design**. Admin controls require tenant scoping, recent MFA, independent approval and audit history; protected evidence cannot be silently rewritten.

---

> **v0.31 Content & Template Administration checkpoint** — see `CHANGELOG_V31.md`, `docs/V31_CONTENT_TEMPLATE_ARCHITECTURE.md` and `docs/V31_KALI_RUNBOOK.md`. New migration `012_content_templates.sql`. Offline-tested only; not production-ready.

# AssetTrust v0.30 — Workflow & Approval Rule Administration

**Compiled by Aturinzire Hargreave.** DDD · TDD · SOLID · Clean Architecture · Security by Design.

New organization-scoped **Workflow Designer**: choose stage targets and reminder lead times, optionally add an **independently accepted** evidence type, and use versioned two-administrator approval with recent MFA and audit history. Once approved, additional evidence is enforced in case readiness and stage advancement. Mandatory evidence stages, professional review, disputes and legal disclaimers remain immutable.

**Start here:** [Workflow architecture](docs/V30_WORKFLOW_ADMIN_ARCHITECTURE.md) · [Kali Linux runbook](docs/V30_KALI_VALIDATION.md) · [Test evidence](docs/TEST_EVIDENCE_V30.md) · [Changelog](CHANGELOG_V30.md).

**Release status:** BLOCKED — missing authentic npm lockfile, full NestJS/React build and live PostgreSQL/browser verification. Existing stages and UI remain present. Automatic reminder delivery is not yet connected.

---

# AssetTrust v0.29 — Member Governance & Permissions

**Compiled by Aturinzire Hargreave.**

This release adds a real, tenant-scoped member-management API and responsive administration page. Sensitive role changes require two separate current administrators and fresh MFA; suspensions revoke user sessions; professional qualifications remain independently verified. The role catalogue is **not** a customizable permission builder. Existing protected evidence and audit history are preserved.

**Start here:** [Member Governance Architecture](docs/V29_MEMBER_GOVERNANCE.md), [Kali Linux Validation](docs/V29_KALI_VALIDATION.md), [Test Evidence](docs/TEST_EVIDENCE_V29.md), and [Changelog](CHANGELOG_V29.md).

**Release status: BLOCKED** — missing genuine npm dependency lockfile, full compilation, live PostgreSQL and browser verification.

---

# AssetTrust v0.28 — Admin Control Plane Foundation

**Compiled by Aturinzire Hargreave.**

v0.28 adds a scoped, audited and versioned administration foundation on top of v0.27. Global administrators have a separately bootstrapped appointment; organization administrators manage only their own allowed settings. High-impact changes need independent approval and recent MFA. See [architecture](docs/V28_ADMIN_CONTROL_PLANE.md), [Kali Linux runbook](docs/V28_KALI_VALIDATION.md) and [test evidence](docs/TEST_EVIDENCE_V28.md).

This is NOT a production-ready release; no authentic npm lockfile is included and the live full build/PostGIS and browser tests have not passed here. An editable configuration catalogue is not equivalent to an operational billing, registry, workflow, permissions or notification editor.

---

# AssetTrust v0.27 — Secure Co-Administrator Onboarding

This release adds a separate, audited `ORG_ADMIN` invitation flow with recent MFA step-up, one-time hashed tokens, mandatory MFA enrollment before privileged access, and two-person final review support. **Development checkpoint, not production-ready.** See [`docs/V27_COADMIN_SECURITY.md`](docs/V27_COADMIN_SECURITY.md) and [`docs/V27_KALI_RUNBOOK.md`](docs/V27_KALI_RUNBOOK.md).

# AssetTrust v0.24 — Case Evidence Transactional Authorization

**New:** See [v0.24 security changes](docs/V24_CASE_EVIDENCE_AUTHORIZATION.md), [Kali installation/runbook](docs/V24_KALI_BUILD_AND_TEST.md), and [test evidence](docs/TEST_EVIDENCE_V24.md). Run `npm run verify:v24`. **Not production-ready:** full build and live database tests remain blocked, and an authentic npm lockfile must be generated on a connected machine.

---

# AssetTrust v0.23 — Transactional Authorization Checkpoint

**Compiled by Aturinzire Hargreave**  
**Engineering:** DDD · TDD · SOLID · Clean Architecture · Security by Design  
**Release decision:** BLOCKED — not production-ready.

v0.23 prevents permission changes between the initial request check and the database write from silently authorizing document uploads or parcel changes. Current asset, case and grant permissions are rechecked with transaction-scoped row locks. For details, start with [v0.23 Security Design](docs/V23_TRANSACTIONAL_AUTHORIZATION.md), [Kali Runbook](docs/V23_KALI_RUNBOOK.md), [Test Evidence](docs/TEST_EVIDENCE_V23.md), and [Changelog](CHANGELOG_V23.md).

**Offline test command:** `npm run verify:v23`. **Known release blockers:** missing authentic npm lockfile, full production build, and live PostgreSQL/PostGIS/browser integration results. No new UI designs were added in this security checkpoint; earlier responsive screens remain included.

---

## Earlier development checkpoint notes

> **Latest development checkpoint — v0.21**: transaction-scoped live surveyor accreditation rechecks during parcel review, plus a guarded disposable PostgreSQL assertion runner and fail-closed TypeScript compilation. Read [v0.21 changelog](CHANGELOG_V21.md), [security design](docs/V21_SURVEYOR_AUTHORIZATION.md), [Kali guide](docs/V21_KALI_RUNBOOK.md), and [test evidence](docs/TEST_EVIDENCE_V21.md). **Production release remains blocked:** missing authentic npm lockfile, full build and real PostGIS/browser verification.

> **Latest development checkpoint — v0.20**: MFA downgrade authorization hardened; see [changelog](CHANGELOG_V20.md), [security/Kali guide](docs/V20_SECURITY_AND_KALI.md), and [test evidence](docs/TEST_EVIDENCE_V20.md). **Production release remains blocked** by missing authentic npm lockfile, unavailable full build, and outstanding live PostgreSQL tests.

# AssetTrust v0.18 — Identity Recovery Security

**Compiled by Aturinzire Hargreave**  
**Architecture:** DDD • TDD • SOLID • Clean Architecture • Security by Design  
**Release:** BLOCKED pending reproducible build and live integration tests.

This checkpoint fixes reuse of consumed MFA backup codes during account MFA removal. Run `npm run verify:v18` to execute the regression suite (five tests), then follow [v0.18 Kali and Security Guide](docs/V18_KALI_AND_SECURITY.md) and [Test Evidence](docs/TEST_EVIDENCE_V18.md). Existing frontend and backend code is preserved. **No live PostGIS test or successful full build has been demonstrated in this environment.**

---

# AssetTrust v0.17 — Build integrity and architectural boundaries

**Compiled by: Aturinzire Hargreave**  
**Standards:** DDD · TDD · SOLID · Clean Architecture · Security by Design  
**Release status:** BLOCKED pending a real `package-lock.json`, successful dependency installation, full builds and live integration tests.

Start with [v0.17 build guide](docs/V17_BUILD_INTEGRATION_RUNBOOK.md), [test evidence](docs/TEST_EVIDENCE_V17.md), and [changelog](CHANGELOG_V17.md). Run `npm run verify:v17` for the new offline checks; use `npm run release:gate:v17` to enforce a complete dependency graph. Existing React UI, API, PostGIS and mapping modules remain in the source.

---

# AssetTrust v0.15 — Safer live integration runner

This checkpoint extends v0.14 and preserves the existing React/NestJS/PostgreSQL/PostGIS modules and black/gold/green responsive designs. It adds a fresh per-run disposable API marker, loopback binding for test servers, strict preflight and tests against a real localhost HTTP server. **It has not passed a full app build or live database integration.**

**Start here:** `docs/V15_RUNBOOK.md` · `docs/TEST_EVIDENCE_V15.md` · `CHANGELOG_V15.md`.

# AssetTrust v0.13 — Integration Stability Checkpoint

**Compiled by Aturinzire Hargreave**  
**Engineering:** DDD · TDD · SOLID · Clean Architecture · Security by Design  
**Status:** Development checkpoint; **not production-ready**.

**What's changed in v0.13:** independent per-run CI secrets, corrected JWT placeholder rejection, real startup-policy preflight, isolated disposable PostGIS test database, supervised API integration runner, and 20 new security/CI tests. Earlier React UI and business workflows are preserved.

**Start here:** `docs/V13_INTEGRATION_AND_CI_RUNBOOK.md` · `docs/TEST_EVIDENCE_V13.md` · `docs/IMPLEMENTATION_STATUS_V13.md` · `CHANGELOG_V13.md`.

**Run offline checks:** `npm run verify:v13`. **Full API/Web build:** `npm install && npm run build` on a machine with registry access. **Do not run full integration scripts against production data.**

---

# AssetTrust v0.12 — Land & Asset Verification Platform

**Compiled by: Aturinzire Hargreave**  
**Architecture:** Domain-Driven Design • Test-Driven Development • SOLID • Clean Architecture • Security by Design

A Uganda-first land and asset verification evidence platform. This application does **not** replace the Uganda National Land Information System or provide authoritative proof of land title. Submitted boundaries and cryptographic hashes are never treated as legal ownership certificates.

## What's new in v0.12

This checkpoint introduces **fail-closed configuration validation**, prevents destructive HTTP tests from contacting unmarked servers, and adds 22 new offline RED → GREEN tests. Existing dashboard, verification, encrypted-vault and geospatial modules are preserved. No new UI screen was added because this milestone focuses on deployment and integration safety.

- [v0.12 Kali integration runbook](docs/KALI_LIVE_INTEGRATION_V12.md)
- [v0.12 test evidence and release decision](docs/TEST_EVIDENCE_V12.md)
- [v0.12 changelog](CHANGELOG_V12.md)

**Status:** Offline regressions pass; full npm build, PostgreSQL, browser flows and external integrations remain unverified. **Not production-ready.**

## Fresh local development setup

See [the v87 Kali validation guide](V87_KALI_VALIDATION.md)
for this checkpoint's setup and validation procedure.

The older `.env.example` setup instructions do not apply to this
snapshot: that template is absent. Keep generated local credentials
out of Git.

This is a development checkpoint. Successful production startup and
full live acceptance have not yet been confirmed.

UI: http://localhost:5173 • API liveness: http://localhost:4000/api/v1/healthz • API readiness: http://localhost:4000/api/v1/readyz

## Available packages

- `apps/api`: NestJS API, PostgreSQL/PostGIS adapters, encrypted document vault, trust and verification domains.
- `apps/web`: React responsive UI and live operational readiness view.
- `services/tiles`: locally hosted MBTiles raster service (synthetic demo tiles by default).
- `tools/migrations`: checksum-aware migration runner and policy.
- `tools/tests-v11`: offline tests for migration and schema readiness.
- `docs/`: architecture, security, migrations and test evidence.

## Validation status

Offline policy/domain tests and source-rendered mobile/desktop previews pass. **Full npm typecheck/build, live PostgreSQL and browser integration were not verified in the artifact creation environment.** See `docs/TEST_EVIDENCE_V11.md`.

## v0.14 integration checkpoint (7 November 2026)

To inspect the current source prerequisites without downloading anything, run `npm run preflight:v14`. The check lists missing packages and reports if a reproducible npm lockfile is absent. `npm run verify:v14` runs 10 offline policy tests for identity-bound CI readiness and build prerequisites. See [`docs/V14_INTEGRATION_READINESS.md`](docs/V14_INTEGRATION_READINESS.md) and `test-evidence/v14` for the release gate decision, reproducible tests and the recorded full-build blocker. **A successful offline test run does not mean the full application has built or been deployed.**

## v0.19 security checkpoint

**Compiled by Aturinzire Hargreave.** Login now performs an Argon2id verification for both unknown and existing emails to reduce account-enumeration timing differences. Run `npm run verify:v19`. This remains a development checkpoint: the authentic npm lockfile, full application build, and live PostgreSQL/browser integration gates have not passed. See `docs/V19_KALI_BUILD_AND_SECURITY.md` and `docs/TEST_EVIDENCE_V19.md`.

## v0.23 — professional reviewer authorization

This checkpoint prevents expired login sessions from authorizing professional accreditation attestations, reviewer-queue access or credential revocations after an earlier successful request guard. Run `npm run verify:v22` for the eight regression tests and read `docs/V22_KALI_LIVE_VALIDATION.md` before attempting disposable PostgreSQL integration tests. **Full build and live integration remain unverified.**


### v0.23 security checkpoint
Asset contribution and case attachment rights are rechecked under row locks within the write transaction, to avoid accepting a document upload or parcel modification after permissions are revoked. See `docs/V23_TRANSACTIONAL_AUTHORIZATION.md` for limitations and live test instructions.


## v0.25 Current Workflow Authorization Checkpoint

Transaction-time checks now protect evidence review, stage advancement and case assignment from stale role/accreditation claims. Run `npm run verify:v25`; see `docs/V25_WORKFLOW_AUTHORIZATION.md`, `docs/TEST_EVIDENCE_V25.md`, and `docs/V25_KALI_RUNBOOK.md`. **Not production-ready:** authentic npm lockfile, full build, live database and browser tests remain unresolved.


## v0.26 — FINAL_REVIEW policy correction

This checkpoint corrects the impossible final approval condition in `evidence-policy.ts`. A final DECISION must be independently reviewed by a different `ORG_ADMIN`; once independently accepted, an authorized administrator can close the private verification case. The preceding legal-review stage still requires a current accredited `LEGAL_REVIEWER`.

**Known limitation:** normal team invitations cannot onboard another `ORG_ADMIN`; implement secure, MFA-verified co-admin invitation before using this workflow in production. Full npm build, PostgreSQL and browser validation remain blocked; see `docs/TEST_EVIDENCE_V26.md`.

## v0.32 — Approved content now drives selected application outputs

Approved `report.summary` text appears in private non-official report drafts with revision metadata. Approved `notification.case_assigned` text is stored for in-app assignment events. Approved global hero and support text is read from a narrowly allowlisted public endpoint for the sign-in page. Pending proposals never publish automatically. External SMS/email and signed reports remain disabled. For the exact scope and safety rules see `docs/V32_PUBLISHED_CONTENT_INTEGRATION.md`, `docs/V32_KALI_VALIDATION.md` and `docs/TEST_EVIDENCE_V32.md`.

## v0.33 — Admin Notification Provider Staging

Organization administrators can now prepare Email/SMS provider routes through **Admin Control Plane → Notification Providers** with a strict allowlist, audited versioned proposals, current-MFA validation, independent two-person approval and tenant isolation. Credential fields accept **secret aliases only** (`vault://namespace/alias`). External delivery is deliberately **NOT_CONNECTED**: staging a provider never sends messages or enables real SMTP/HTTP traffic. Existing in-app notifications are unchanged.

See [v0.33 architecture](docs/V33_PROVIDER_CONTROL_ARCHITECTURE.md), [Kali validation](docs/V33_KALI_VALIDATION.md), and [test evidence](docs/TEST_EVIDENCE_V33.md). New commands: `npm run verify:v33` and (only against an authorized disposable local database) `npm run test:pg:providers:v33`. This is an offline-tested development checkpoint, not a production release.

### v0.37 PDF evidence export

Authenticated organization admins with fresh MFA can now download a non-official private A4 PDF and a separately signed Ed25519 receipt from Report Issuance. Verify the exact bytes using `node tools/verify-report-pdf-v37.cjs <report.pdf> <receipt.json> <PINNED_PUBLIC_KEYS.json>`. The PDF is not PAdES signed, is not a government title certificate, and must be rechecked for status after export. See `V37_KALI_VALIDATION.md` and `V37_PDF_REPORT_ARCHITECTURE.md` before trying this checkpoint on an existing environment.


### v0.38 governed report layouts

Organization admins now have a **PDF report design control** on Report Issuance. A change to the printable header, footer or dark accent is proposed by one current MFA-verified administrator and approved by another. The active revision is used for subsequent authenticated PDF exports and recorded in the export audit. Changes never modify issued evidence, legal disclaimers or prior signed PDF bytes. See `V38_KALI_VALIDATION.md`, `V38_LAYOUT_ARCHITECTURE.md` and `TEST_EVIDENCE_V38.md`. **Requires SQL migration `016_report_pdf_layouts.sql`** on an authorized, backed-up database. Production build, live database and browser validation remain pending.

## v0.52: mandatory confidential-document malware screening

The `POST /api/v1/documents/upload` flow now requires a trusted ClamAV clean verdict before persisting encrypted documents. Production config must include `CLAMAV_SOCKET_PATH` pointing at a private Unix socket; the API refuses production startup without it, and the upload fails closed if the scanner is unavailable. CI/dev may use loopback `CLAMAV_TCP_PORT`, never a remote scanner port. Test the real daemon with `npm run security:clamav:v52`. See `V52_KALI_VALIDATION.md` and `V52_SECURITY_REPORT.md` before deployment. Existing customer data is not approved for use; release gate remains **NO-GO**.


## v0.75 checkpoint

Source-only milestone that adds transaction-current authorization to asset and case operations. Run `npm run verify:v75` and consult `V75_HANDOVER.md` / `V75_KALI_VALIDATION.md`. **Do not deploy from this checkpoint without genuine dependency-backed build and full live security acceptance.**

## v0.87 continuous acceptance integrity

For disposable Kali integration, run `npm run kali:acceptance:plan:v87` and `npm run kali:acceptance:inspect:v87` first. The authenticated supervised runner is `ASSETTRUST_V71_ACCEPTANCE_CONFIRM=YES ASSETTRUST_V70_LOCAL_CONFIRM=YES npm run kali:acceptance:run:v87` **only after** preparing a safe local test fixture. It recomputes the recorded source and compiled-artifact provenance before and after each child command, aborting on drift. Follow `V87_KALI_VALIDATION.md`; production remains NO-GO until authentic compilation and all live security gates pass.
