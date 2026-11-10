# AssetTrust v0.21 — Kali Linux Build and Integration Runbook

**Compiled by Aturinzire Hargreave**. Only use a *fresh disposable local test database* for the example integration commands. Never point test scripts at an existing customer, demonstration, staging-with-real-data, or production database.

## 1. Extract and inspect

```bash
cd ~/Downloads
unzip AssetTrust_v21_Current_Surveyor_Authorization_Checkpoint.zip
cd assettrust-v21
node --version   # Must be >= 22.12
npm --version
```

Before generating a lockfile or installing packages, check the workspace dependency declarations in `package.json`, `apps/api/package.json` and `apps/web/package.json`.

## 2. Resolve dependencies and the release gate

On an **internet-connected** machine, from the project root:

```bash
npm install
# Review the generated package-lock.json. Commit it to version control.
npm ci
npm run release:gate:v17
npm run preflight:v14
npm run build
```

The complete build has not passed in the source-creation environment because no project npm dependencies were installed. That environment reports `TS2688` for the missing Node type definitions. v0.21 also enables `noEmitOnError`, so a failed API compilation cannot leave newly emitted, potentially partial JavaScript behind. The packaged source omits generated `apps/api/dist` files; run a successful build before invoking `npm run start`. If your connected Kali machine reports different compiler errors, **do not bypass TypeScript strictness**; correct and retest those errors. Do not create a fake lockfile.

## 3. Run offline tests

```bash
npm run verify:v21
npm run verify:v20
npm run verify:architecture
npm run verify:syntax
```

The official CI workflow also runs all prior v0.3–v0.20 verification suites. `npm run verify:v21` does **not** contact the database or change records.

## 4. Disposable PostgreSQL/PostGIS test

This section is for a **new** database named `assettrust_test` (or `assettrust_ci`) with **no real data**. PostgreSQL must be exposed only on a loopback interface. The current `compose.yaml` development service may have a different default database name; do not assume it points to this new test database. Create the separate disposable database with your own local PostgreSQL administration tooling and verify its identity first.

```bash
export NODE_ENV=test
export DATABASE_URL='postgresql://assettrust:YOUR_LOCAL_TEST_PASSWORD@127.0.0.1:5432/assettrust_test'
# ONLY after inspecting the test DATABASE_URL above:
npm run db:migrate
npm run db:check
export ASSETTRUST_E2E_ALLOW_MUTATION=YES
npm run test:pg:parcel-auth:v21
unset ASSETTRUST_E2E_ALLOW_MUTATION
```

The `test:pg:parcel-auth:v21` command rejects non-loopback hosts, non-test environments, missing explicit permission, and database names without the `_test` or `_ci` suffix. It uses a transaction and rolls back its fictional fixture data. Its effectiveness and SQL syntax still need a real PostgreSQL run; they have **not** been verified by the offline test run.

To perform full HTTP integration (auth, professional approval, parcel reviews), configure independent test-only JWT/MFA/document secrets according to the v0.13 and v0.20 runbooks and use the isolated supervised integration runner. The new live SQL assertion checks the repository's credential predicate, not the complete browser workflow.

## 5. Manual concurrency test still needed

On a disposable database with genuinely test-only professional credentials, use two concurrent transactions: one reviewing a submitted parcel and one revoking the surveyor's accreditation. Verify that the row locks serialize, and that no review is authorized **after the revocation completes**. Record the resulting database audit entries and rejected/accepted status. Also repeat this after disabling MFA and revoking the session.

## 6. Release gate

The following must all pass before any production deployment:

- Authentic, reviewed npm lockfile and `npm ci`
- Strict NestJS + React builds and test suite
- Schema migrations, readiness probes and role/MFA/accreditation checks on real PostGIS
- HTTP and browser end-to-end tests including tenant isolation, encrypted document operations, and concurrency
- Independent security, backup/restore, privacy and infrastructure review

**No v0.21 release approval is implied by the ZIP checkpoint.**
