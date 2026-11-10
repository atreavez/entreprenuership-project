# AssetTrust v0.19 — Kali Linux build and integration runbook

Compiled by Aturinzire Hargreave. Development checkpoint only; not approved for production.

## Security change

`apps/api/src/auth.ts` now invokes Argon2 password verification whether a submitted login email exists or not. An unknown account uses a precomputed **public non-secret** dummy hash with Argon2id parameters `m=65536,t=3,p=4` rather than skipping verification. Avoid interpreting this as proof of perfectly equal response timing. Invalid logins should have the same user-facing error. The fake-database test in `tools/tests-v19/login-enumeration.test.cjs` runs the actual `AuthenticationService` login method from transpiled TypeScript; it is not a PostgreSQL or HTTP integration test.

## Clean dependency setup (on a network-connected Kali system)

1. Extract this ZIP and `cd assettrust-v19`.
2. Check Node >=22.12 with `node -v`; verify npm registry access using `npm ping --registry=https://registry.npmjs.org`.
3. Review the root and both workspace `package.json` files, then run `npm install` **once** to resolve actual dependencies and generate `package-lock.json`.
4. Review `package-lock.json`, especially unexpected package sources or scripts. Commit the lockfile to your repository, then run `npm ci` to verify a clean deterministic install.
5. Run `npm run verify:v19`, `npm run verify:architecture`, `npm run verify:syntax`, and `npm run release:gate:v17`.
6. Run `npm test` and `npm run build`. Resolve compilation errors instead of disabling strict TypeScript or bypassing tests.

## Database and end-to-end verification

Only on an **isolated, disposable developer database** (not a production or existing v0.10/v0.11 database):

1. Copy `.env.example` to `.env`, generate separate strong secrets using `openssl rand -hex 32`, configure valid keyrings and trusted WEB_ORIGIN, and keep the `.env` out of Git.
2. Start the local PostgreSQL/PostGIS service using `docker compose up -d postgres` and confirm the database URL points to that disposable instance.
3. Run `npm run db:migrate` and `npm run db:check`; follow the explicit baseline procedure in earlier runbooks for existing databases rather than issuing fresh-install migrations.
4. Run `npm run test:e2e:ci` with a fresh, correctly matched `ASSETTRUST_E2E_TARGET_ID`/`ASSETTRUST_E2E_EXPECT_TARGET` marker and `ASSETTRUST_E2E_ALLOW_MUTATION=YES`. This supervisor launches a disposable local test API and may create and modify test records. Prefer the existing CI workflow for a properly configured one-off PostGIS instance.
5. Record API, database, and browser test output. Do not publish or deploy until all release gates pass.

## Verified in this checkpoint

`npm run verify:v19`: **3/3 passed**, including an observed test-first RED failure before the fix.

Previous offline checks: `smoke:offline`, `verify:v03` through `verify:v18`, `verify:architecture`, `verify:syntax`: **19/19 commands passed**.

`npm run release:gate:v17`: **blocked**, because authentic `package-lock.json` is absent.

`npm run build`: **blocked** with TS2688 because `@types/node` and other app dependencies are not installed.

`npm view @nestjs/core version` failed with `EAI_AGAIN` from the npm registry. PostgreSQL/Docker executables are not available in this workspace.
