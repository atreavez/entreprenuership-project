# AssetTrust v0.51 - Security Engineering Verification Report

**Date:** 11 November 2026
**Checkpoint:** v0.51.0
**Release decision:** **NO-GO** (not approved for live customer data).

## Objective and result

The recurring release blocker is an absent authentic npm dependency lockfile and a lack of a connected PostgreSQL/browser environment for integration evidence. v0.51 adds a guarded, reproducible **operator validation workflow** instead of claiming that missing runtime evidence can be reproduced offline. No new SQL migration or business feature was added. Existing RLS policies still cover seven private tables in source, with live enforcement unverified.

## Delivered controls

- Dependency-source policy: rejects Git, filesystem, non-HTTPS and untrusted package-resolution hosts, and checks workspace dependency/integrity consistency when a genuine npm lockfile is available.
- Release runner: reproducible `npm ci`, high/critical dependency audit, all 49 historical/current version suites, architecture/syntax checks, API tests and API/web builds, and full Git-history secret scan; refuses missing lockfile before acting.
- Disposable PostgreSQL runner: requires `NODE_ENV=test`, explicit mutation approval, loopback server, `_ci`/`_test` DB suffix and a confirmation exactly matching the database name before migration/testing.
- Evidence: status, stop-on-failure, exit codes and durations in a local JSON summary; secrets/URLs excluded. Always `productionApproved:false`.
- CI now includes v0.51 tests and the read-only runner plan.

## Executed verification

| Control | Result |
| --- | --- |
| New v0.51 offline suite | **17 / 17 PASS** |
| All version verification suites v0.03-v0.51 | **49 / 49 PASS** |
| Architecture, TypeScript syntax, CI coverage, offline smoke | **PASS** |
| Existing migration SHA-256 manifest | **25 / 25 MATCH** |
| Read-only v0.51 release plan | **PASS** |
| Full supply-chain check | **BLOCKED** (authentic npm lockfile absent) |
| `npm ci --offline` | **FAILED** (lockfile absent) |
| `npm test`, `npm run build` | **FAILED** (dependencies missing) |
| v0.50 PostgreSQL test | **NOT RUN** (guard correctly refused missing authorization) |
| Full Git-history secret scan | **NOT RUN** (archive lacks `.git`) |
| Read-only v0.41 release preflight | **3 / 11 prerequisites present** |

Synthetic runner success tests are **mock tests only**, not evidence of real npm installs or database migration. No external registry, production environment, third-party secret vault, real organization records, or deployed reverse proxy was accessible.

## Residual risk and priorities

1. **CRITICAL release gate:** obtain a real reviewed `package-lock.json`, run `npm ci`, dependency audit, tests/build on connected Kali; do not synthesize or guess package versions.
2. **CRITICAL release gate:** apply all 25 migrations and run the PostgreSQL contracts against a genuinely disposable local database, with least-privilege runtime credentials and tenant A/B denial tests.
3. **HIGH release gate:** complete encrypted evidence upload malware scanning, production HTTPS/firewall/SSH, browser CSRF/cookies, login/MFA/reset, and recipient end-to-end tests with two API servers.
4. **HIGH release gate:** scan complete Git history and rotate any confirmed exposed credentials; restore-test database backups, document keys and report-signing keys.
5. **REVIEW:** finish user/membership and remaining sensitive-table RLS rollout, pricing/payment authority tests, platform-super-admin and organization-admin authorization, logging/retention and independent penetration/legal review.

**This package contains implementation and offline evidence only. It is not a security certification or deployment approval.**
