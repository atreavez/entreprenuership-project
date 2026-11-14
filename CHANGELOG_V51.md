# AssetTrust v0.51 - Reproducible Build and Supervised Release Evidence

Date: 11 November 2026

**Scope:** Release engineering and dependency supply-chain security. No new database migration, API endpoint, or business capability. Version 0.51.0 is an engineering checkpoint, **not** a production release.

## Delivered

- `tools/supply-chain-policy-v51.cjs` rejects direct Git/VCS/filesystem/insecure HTTP dependency specifiers and lockfiles resolving packages from unapproved hosts or with embedded URL credentials; retains pre-existing strict workspace dependency/integrity validation. Only registry.npmjs.org is accepted by default. It intentionally refuses a missing or inconsistent authentic npm lockfile.
- `tools/release-validation-v51.cjs` provides explicit read-only plan/preflight, build validation, disposable PostgreSQL validation, and combined validation modes. The runner checks all preconditions BEFORE running any npm install or database migration, executes `npm ci`, high-severity production dependency audit, all declared version suites, static architecture checks, full API tests and builds, and Git-history secret scanning. The DB phase checks migrations and runs all declared `test:pg:*` contracts against an explicitly authorized loopback `_ci`/`_test` database.
- The runner writes only exit/status/duration evidence to `test-evidence/v51/local-validation-summary.json`; it does not serialize DATABASE_URL, environment secrets, or child stdout into the report. A child's nonzero exit stops execution. `productionApproved:false` is immutable.
- Root and both workspaces bumped to 0.51.0, seven v0.51 commands declared, CI coverage upgraded to include `verify:v51` and `release:plan:v51`.
- `tools/tests-v51/release-supply-chain.test.cjs` contains 17 passing targeted test cases, including synthetic fixture tests for successful, failing and refused supervised executions. **These simulated runs do not count as actual npm builds or database tests.**

## Offline evidence

- 49/49 version suites v0.03 through v0.51 passed.
- 17/17 new v0.51 tests passed (subset of version matrix).
- `verify:ci:v41`, `verify:architecture`, `verify:syntax`, `smoke:offline` passed.
- All 25 SQL migration SHA-256 fingerprints continue to match the pinned manifest. No SQL migration added or edited.
- `npm ci --offline` fails because authentic `package-lock.json` is missing; full `npm test` and `npm run build` fail on absent dependencies. Runtime PostgreSQL contract was **not run**; safe guard rejected missing authorization. `release:preflight:v41` remains 3/11.
- npm registry access from this execution environment returned EAI_AGAIN, so a reproducible lockfile could not be obtained here.

## Remaining blockers

Review and commit a genuine npm v3 lockfile on the connected Kali source clone, remediate high/critical production vulnerabilities, run `npm ci` and full builds/test suite, run real PostgreSQL migration and isolation contracts on a verified disposable database, run genuine two-API and authenticated browser workflows, restore backups, inspect actual Git history, verify HTTPS/SSH/firewall, malware scanning, secrets and independent security/legal review. Do not collect real customer evidence or deploy commercially before release signoff.
