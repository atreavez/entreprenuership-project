# AssetTrust v0.26 — Kali Linux validation

**Use only a development/staging database. Do not reuse production secrets or bypass the release gate.**

## 1. Unpack and inspect

```bash
cd ~/Downloads
unzip AssetTrust_v26_Final_Review_Reachability_Checkpoint.zip
cd assettrust-v26
node --version
npm --version
```

The project requires Node.js >=22.12. The source archive intentionally includes no fabricated dependency lockfile.

## 2. Install reproducibly on an internet-connected machine

```bash
npm install
# Review package-lock.json and commit it to your version-controlled repository.
npm ci
npm run release:gate:v17
```

Do not proceed if any command fails. Do not disable SSL certificate verification, install unreviewed dependencies, or generate a hand-written placeholder lockfile.

## 3. Run the offline policy and architecture tests

```bash
npm run verify:v26
npm run verify:v25
npm run verify:v03
npm run verify:architecture
npm run verify:syntax
npm test
npm run build
```

The `verify:v26` script executes the real domain/application TypeScript in isolated test fixtures and separately performs a strict compile of those two framework-free modules. A full `npm run build` is mandatory and may reveal errors not detectable by isolated tests.

## 4. Fresh disposable PostgreSQL/PostGIS environment only

Follow `.env.example` and `docs/V11_MIGRATION_AND_RELEASE.md`. Create **a new disposable database** explicitly, for example `assettrust_test` owned by a dedicated local test user, and set `DATABASE_URL` to that local-only target. Never modify or baseline an existing client database without a reviewed backup and migration plan.

```bash
docker compose up -d postgres
# Create and select a distinct EMPTY local-only database named assettrust_test.
# Set your own secure JWT, MFA and document-encryption keys in an untracked .env.
# Run schema migrations and readiness checks only once the target is verified.
npm run db:migrate
npm run db:check
```

Review the existing `test:pg:*` and `test:e2e:ci` safety instructions before enabling any test mutations. For FINAL_REVIEW, use two different **authorized organization administrators** in the same tenant (securely provisioned), a previously approved legal-stage opinion, a submitted `DECISION` by the first admin, and acceptance by the second admin. Confirm `CLOSED`, audit trail and `REVIEW_COMPLETED`; verify self-review, revoked role, cross-tenant access, and unresolved dispute are blocked. The current regular invitation endpoint **cannot invite a second ORG_ADMIN**; this onboarding gap must be resolved before operational use.

## 5. Exit criteria

Require authentic npm lockfile, clean `npm ci`, full API/React build, fresh-schema checks, actual PostgreSQL and HTTP/browser integration, secure co-admin provisioning, and an independent security review. None of the successful offline tests prove production-readiness or official title status.
