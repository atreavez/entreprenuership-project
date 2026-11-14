# AssetTrust v0.29 — Verification Evidence and Release Decision

**Compiled by Aturinzire Hargreave**  
**Date of verification:** 10 November 2026  
**Release decision:** **BLOCKED / NOT PRODUCTION READY**.

## What actually ran

| Verification | Observed result | Evidence |
|---|---|---|
| `npm run verify:v29` | PASS — 27/27 security/domain/service assertions and isolated strict domain typecheck | `test-evidence/v29/verify_v29.log` |
| `npm run verify:v11` | PASS — 18/18 migration checks including current manifest and append-only history | `test-evidence/v29/verify_v11.log` |
| 30 offline verification commands (smoke, v0.3–v0.29, architecture, syntax) | PASS — 30/30 | `test-evidence/v29/REGRESSION_SUMMARY.txt` |
| `npm run verify:syntax` | PASS — 66 TypeScript/TSX source files transpile with 0 syntax diagnostics | `test-evidence/v29/verify_syntax.log` |
| `npm run verify:architecture` | PASS — 3/3 current architecture assertions | `test-evidence/v29/verify_architecture.log` |
| GitHub Actions workflow syntax | YAML parsed successfully | `.github/workflows/ci.yml` |
| Static React-source desktop preview, 1440px | Rendered, no horizontal overflow | `screenshots/v29-member-management-desktop.png` |
| Static React-source mobile preview, 390px | Rendered, no horizontal overflow | `screenshots/v29-member-management-mobile.png` |
| `npm ci` | FAIL — no authentic `package-lock.json` | `test-evidence/v29/blocked_npm_ci.log` |
| `npm run build` | FAIL — missing `@types/node`, NestJS, React-related and other dependencies | `test-evidence/v29/blocked_npm_run_build.log` |
| `npm run release:gate:v17` | FAIL — correctly rejects absent lockfile | `test-evidence/v29/blocked_npm_run_release_gate_v17.log` |
| `npm run test:pg:members:v29` | REFUSED — explicit disposable database authorization missing; no DB was modified | `test-evidence/v29/blocked_npm_run_test_pg_members_v29.log` |
| Real PostgreSQL/PostGIS service | NOT AVAILABLE in this workspace | Environment inspection: no `psql` or `docker` executable |
| Full application HTTP and browser E2E | NOT EXECUTED | Blocked by build and DB prerequisites |

**Offline tests are not equivalent to live integration tests.** The service-level tests execute real transpiled TypeScript methods with isolated controlled SQL doubles; they do not prove the SQL or transaction behavior against a real database.

## Main security scenarios exercised by `verify:v29`
- Unsupported roles and attempts to grant `ORG_ADMIN` through ordinary role management are refused.
- Current administrator role and recent MFA are required for writes.
- Member/role-proposal queries remain scoped to the actor's organization.
- A role proposal is pending until decided by a different current administrator; the proposer cannot self-approve.
- Approved role changes reset professional-approval flags, revoke credentials/sessions and clear obsolete open-case assignments.
- Stale and duplicate proposals are rejected; changes proposed by a subsequently downgraded administrator cannot be approved.
- A suspension immediately revokes active sessions and cancels pending role proposals; restoration does not re-enable old sessions.
- Suspended users are rejected at login, authenticated account lookup and pending MFA challenge completion.
- SQL schema includes tenant-matching composite foreign keys for subject, proposer and deciding administrator.

## Release gates that must pass before deployment
1. Generate a genuine reviewed npm lockfile on an internet-connected machine; perform `npm ci` and full API/web compilation successfully.
2. Apply `010_member_management.sql` through the versioned migration tool on a disposable PostgreSQL/PostGIS database and verify checksums/readiness.
3. Run rollback-only `test:pg:members:v29` and the previous Postgres test suites. Run actual concurrent authorization and session-revocation tests.
4. Run API and browser E2E (two separate administrators and a third member; role change, suspension, MFA, tenant isolation, audit).
5. Complete a staging rollout with backups, observability, migration rollback planning, and explicit security review.

**Do not use this package as an official land registry or proof of property ownership.**
