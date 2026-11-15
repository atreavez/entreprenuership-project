# AssetTrust v0.72 — Security and Release Report

**Verdict: NO-GO.** This is an offline development checkpoint, not a production release.

## Improvements implemented

- On a failed `BEGIN` or failed/uncertain `COMMIT` / failed `ROLLBACK`, `Database.transaction()` destroys the affected node-postgres client instead of returning it to the connection pool. Normal rollback on an ordinary application error still recycles a safe connection; original application errors are not masked by rollback errors.
- API database pool has bounded connection/query/statement/lock/idle transaction timeouts, defined in a framework-independent constant. Configuration is not caller-controlled.
- v0.68 build acceptance now requires the current v72 regression step, and the v0.71 acceptance supervisor checks the current package version and corresponding evidence inventory. A copied old v71 passing report cannot certify v72.
- New tests exercise failure cases and invalid build evidence; source, SQL migration contract, tenant RLS and authentication semantics were not relaxed.

## Outstanding blockers

1. No reviewed `package-lock.json`; npm registry unreachable here, hence real dependency installation, full build and dependency vulnerability audit cannot pass.
2. No live Docker/PostGIS/ClamAV or authenticated HTTP evidence from this checkpoint. The PostgreSQL transaction tests use synthetic clients, not a real running database.
3. No complete Git history; repository-wide secret scan and manual rotation not verified. Limited current-source scan (3,281 files) had zero high-confidence matches, but that is insufficient for release.
4. All privileged admin, MFA, tenant isolation, uploaded document integrity, subscription/transaction pricing, password reset, multi-instance and rollback workflows require live automated and manual acceptance.
5. TLS/secure cookies, private deployment network, no publicly exposed SSH, backups/restore, monitoring, deployment rollback, threat modeling and independent security review remain mandatory.

**Release policy:** Fail closed. No production rollout until all critical and high-severity findings are resolved and independent evidence supports the final security gate. Preserve DDD, TDD, SOLID, Clean Architecture, least privilege, immutable audit, admin control-plane separation, MFA and tenant isolation.
