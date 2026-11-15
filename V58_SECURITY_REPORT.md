# AssetTrust v0.58 - Security and release audit

Date: 11 November 2026

**Verdict: NO-GO for real customers, payments, land-record certification, or production deployment.**

## Material improvement

Earlier CI tests asserted that RLS flags existed and the runtime login was nonprivileged, but an empty table could satisfy the unscoped count check. v0.58 adds a real two-organization fixture contract that runs through a separate restricted PostgreSQL login, testing reads and writes with tenant-local scope. It also fails supervised database validation immediately if the restricted runtime connection is missing or unsafe. Ordinary Kali terminals no longer receive the raw `::add-mask::` credential output from the role provisioner.

## Completed offline evidence

- New v0.58 safety and contract tests: 15/15 passed (source guards, command ordering, role separation, cleanup protocol and file permissions).
- Historical version suites: 56/56 passed (`verify:v03` through `verify:v58`).
- Architecture, TypeScript/TSX syntax (104 source files), CI completeness, YAML security policy and Vite source-entry checks: passed.
- Migration integrity: 25/25 existing SQL source checksums match the pinned manifest; no new migration was added.
- Current source high-confidence secret scan: no matches in 2,469 files; original Git history not checked.

## Not run or blocked

- `test:pg:runtime-tenant-isolation:v58` requires real `pg` dependencies and PostgreSQL with the existing RLS migrations and a separately provisioned runtime account. **NOT RUN** in this container.
- `npm ci` and actual API/React `npm run build`: **BLOCKED** because no authentic root package-lock.json, no project dependencies and npm registry DNS unavailable.
- Real ClamAV service, live RLS on PostgreSQL, multi-API HTTP tests, browser integration, Git-history scan, HTTPS/SSH/restore drill and penetration testing: **NOT VERIFIED**.
- The live test covers four sensitive core tables, not every private table. Three PDF-layout RLS tables remain in the separate earlier contract; membership, workflow, provider and other private records still need a comprehensive database-access assessment.

## Important safeguards and limitations

- v0.58's integration script modifies *only* an explicitly confirmed loopback `assettrust_ci`/`assettrust_test` database. It commits synthetic fixtures so the independent restricted connection can inspect them, and cleans them up on normal exit. A process killed abruptly can leave synthetic rows; the correct mitigation is disposal of the test database.
- The CI runtime role has broad CRUD grants to test application compatibility; these are **not production least-privilege grants**.
- Existing PostgreSQL policies depend on a transaction-local `assettrust.tenant_id` setting; this is not a defense against arbitrary SQL execution. Parameterized queries, application authorization, narrow DB grants and deployment isolation remain necessary.
- AssetTrust is not a government-certified land title verification service without valid official integrations and legal authorization.

## Production decision

**NO-GO.** Require a complete immutable dependency lockfile, clean builds, successful seeded RLS tests through the restricted login, all integration and security gates, independent review, secure configuration and a verified recovery plan before authorizing any commercial pilot.
