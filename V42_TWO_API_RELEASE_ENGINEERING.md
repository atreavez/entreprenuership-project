# AssetTrust v0.42 — Dual-API validation architecture and threat review

Date: 11 November 2026. State: OFFLINE-TESTED CHECKPOINT / PRODUCTION BLOCKED.

## Objective and boundary

The v0.41 `e2e-pg-shared-counter-v41.mjs` races two **database connections** against an isolated copy of migration 018. That is useful for SQL contention but cannot establish that two independent deployed **API processes** share the intended database and enforce coherent recipient-denial behavior. v0.42 adds a real dual-process smoke runner to address this narrower operational question.

The source architecture remains DDD, Clean Architecture and SOLID: the new checks sit entirely under `tools/` and do not move verification or recipient-sharing domain logic into HTTP handlers. TDD evidence consists of intentionally failing v0.42 tests before the new module existed, followed by passing security/policy tests.

## Live execution design

1. Fail closed **before any spawn or package import** unless `CI=true`, `NODE_ENV=test`, `ASSETTRUST_E2E_ALLOW_MUTATION=YES`, `ASSETTRUST_V42_TWO_API_CONTRACT=YES`, and a consistent sufficiently long test ownership marker are supplied. The PostgreSQL URL must resolve to local `assettrust_ci` or `assettrust_test` only; API URL must be a bare localhost origin.
2. Two API ports must be distinct nonprivileged TCP ports (defaults 4101 and 4102); never permit a remote API target. The compiled `apps/api/dist/main.js` must already exist.
3. `prepareIsolatedRunEnvironment` derives a separate cryptographically random marker for each spawned API. Both processes inherit the **same approved DATABASE_URL**, but receive different ports and test ownership markers.
4. `waitForOwnedApiReady` checks the **marker** returned by each `/api/v1/healthz` endpoint and requires actual database+PostGIS+schema readiness via `/api/v1/readyz`. A pre-existing or unrelated process on the port is rejected instead of being assumed to be ours.
5. Submit one POST with an impossible-to-predict nonexistent share UUID and random dummy credentials to each process. Do not place either credential in a path or query string. Require HTTP 404 and `Cache-Control: no-store`; reject 2xx, 429, and 5xx.
6. Stop only the child processes created by the test runner and remove temporary logs. Bounded failure logs are redacted. A nonzero exit code is emitted on failure.

## What this test *does* prove if executed successfully

Both **real compiled NestJS processes** can be started with separate ownership markers, respond with verified health/readiness against one disposable database, and reject unknown recipient capabilities without returning a sensitive payload. This proves neither cross-node lockout nor true client authentication.

## What it does NOT prove

- A valid approved report/share is redeemed exactly once across two servers under simultaneous load, or that 10 cross-node bad attempts block a later valid request. v0.41 SQL-level contention tests exercise the counter separately, not the complete HTTP transaction.
- Correctness of MFA, admin approval, public status, signed PDF receipt, user interface or recipient browser workflows under real auth.
- Enforced shared throttling at an ingress reverse proxy, secure deployment, signed-key storage/rotation, malware scanning, backup/restore, legal authority to retrieve registry data, or adherence to applicable Uganda legal and privacy requirements.

## Operational security and release gates

Never run this against a database containing customer evidence, even if renamed `_ci`. Require least-privilege test credentials, disposable database volume, valid key material only for the test run and an environment-scoped signing key if later testing report PDF issuance. Rotate/revoke any test secrets inadvertently exposed. Do not commit `.env`, API log output, tokens, codes or signer private keys.

Release approval remains unavailable until an authentic reviewed lockfile, clean dependency install and builds, live migrations, PostgreSQL contracts, actual two-server smoke, **valid-share cross-instance race tests**, authenticated browser tests, backup/restore proof and independent legal/security review have all passed with retained trusted execution evidence.
