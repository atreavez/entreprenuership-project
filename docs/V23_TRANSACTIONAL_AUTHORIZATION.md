# AssetTrust v0.23 — Transactional Authorization and Integration Evidence

Compiled by Aturinzire Hargreave

## What was fixed

Before v0.23, the document upload and parcel mutation controllers called `AccessService` to determine whether a user could contribute. The actual database mutation happened later, often after encryption or additional application processing. A grant could be revoked, downgraded, or expire between these steps without being rechecked by the mutation transaction.

v0.23 keeps the request-time checks for fast feedback **and adds authoritative transaction-scoped checks**. A new infrastructure adapter, `contexts/access/infrastructure/transactional-access.ts`, validates the actor's current organization membership and role and locks the relevant asset, case, or contributing grant while the write is committed.

- **Assets:** current `ORG_ADMIN`, actual creator, current case creator/assignee, or an unexpired `CONTRIBUTE` grant. An ordinary `READ` grant never permits contribution.
- **Confidential cases:** current organization admin, case creator, or assigned reviewer only. Asset grants do not permit case attachment access.
- **Parcel create, submit, and review:** permissions are rechecked inside each transaction, even after the controller accepted a request. Reviews retain exclusive asset locking for serialized acceptance.
- **Document uploads:** the encrypted blob is written first, then permission checks and metadata/audit creation occur in one transaction. If authorization fails, the staged encrypted blob is deleted. Both asset and case permissions are checked where both are supplied.
- **Organization isolation:** each authorization statement checks the actor's current organization membership and the asset/case organization.

The adapter belongs to the infrastructure layer and does not introduce framework or SQL dependencies into domain/application code. No database migration is needed for v0.23.

## Test-first evidence

RED: initial `verify:v23` run, **0/10 tests passing**, before the shared access adapter and transaction call sites were added. GREEN: after implementing the adapter, the initial 10 tests passed. Additional document-upload service tests increased the new suite to **14 tests**. Previous v0.20 and v0.21 harnesses were updated to use the real new adapter, instead of failing on the added module import. Consult `test-evidence/v23` for final captured results.

### Local offline tests

```bash
npm run verify:v23
npm run verify:v20
npm run verify:v21
npm run verify:architecture
npm run verify:syntax
```

The isolated v0.23 TypeScript check uses `tools/tsconfig-v23.json` and `tools/typecheck-v23/nest.d.ts` because the full NestJS dependencies are unavailable in the artifact workspace. This confirms only the new adapter's static type safety, **not** the production build.

### Real PostgreSQL integration (requires a disposable DB)

The new script `tools/e2e-pg-access-v23.mjs` imports the actual **compiled** authorization adapter, uses the installed `pg` client, and exercises current grants, grant downgrade/expiry, case assignment removal and exclusive asset locking. Test inserts run in a rollback transaction and the guard refuses non-local/non-test databases. Run only after reviewing the script and its target:

```bash
npm ci
npm run build
# Start a NEW disposable PostGIS database and run migrations first.
export NODE_ENV=test
export DATABASE_URL='postgresql://assettrust:YOUR_TEST_PASSWORD@127.0.0.1:5432/assettrust_ci'
npm run db:migrate
npm run db:check
ASSETTRUST_E2E_ALLOW_MUTATION=YES npm run test:pg:access:v23
```

Do not point these commands at existing customer or production records. The SQL integration script is **included but unexecuted** in the sandbox because no live Postgres service or installed project dependencies are available.

## Release blockers

1. The project still lacks an authentic, reviewed `package-lock.json` produced by a successful network-connected `npm install`.
2. The full API/React build cannot be verified here: npm registry DNS resolution fails, and required NestJS/React/Node type dependencies are missing.
3. Real PostgreSQL/PostGIS SQL, concurrent revocation locking, HTTP flows and browser end-to-end tests have not been demonstrated in this environment.
4. No Uganda government registry access or official title validation is implemented. Geospatial overlays and private records are *not* legal proof of ownership.

**Release decision: BLOCKED / NOT PRODUCTION READY.**

## Engineering and threat-model limitations

The authorization locks ensure that concurrent grant revocation and contribution mutations are serialized for the rows selected, provided the application transaction and row locks execute as intended on PostgreSQL. Other mutation modules still need dedicated review for time-of-check/time-of-use defects. The exact lock behavior must be verified with two concurrent PostgreSQL connections in staging. This checkpoint does not claim those concurrency tests passed.

A future security review should also assess PostgreSQL row-level security as an independent tenant boundary, richer session expiry and audit integrity semantics, malware/content scanning, file lifecycle reconciliation, and permission checks across every remaining write endpoint.
