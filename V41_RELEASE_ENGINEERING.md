# AssetTrust v0.41 — Release engineering architecture and controls

**Checkpoint date:** 11 November 2026. **Release decision:** BLOCKED for production. This milestone improves evidence gathering and CI completeness; it does not add a user-facing land-verification feature or claim live deployment.

## 1. Observed defect in the inherited workflow

The v0.40 repository's `.github/workflows/ci.yml` retained a v0.35 name and stopped its offline version suite at `verify:v35`. It omitted v0.36–v0.40 and the live, disposable PostgreSQL recipient-share and attempt-window contracts. A developer could see “green” CI for an older subset while newer security-critical code remained untested by CI. This is **test coverage drift**, not evidence of an exploitable runtime vulnerability.

## 2. v0.41 changes

- `tools/ci-completeness-v41.cjs` derives all `verify:vNN` and `test:pg:*` scripts from the current root manifest. It checks the GitHub Actions workflow for every declared version and database contract, detects missing script versions, and rejects explicit fail-open `continue-on-error: true`, `|| true` and non-reproducible `npm install` substitutions.
- `.github/workflows/ci.yml` now invokes that policy **before** its existing lockfile gate and `npm ci`, includes versions v0.36–v0.41, and wires the v0.39 and v0.40 live database contracts plus the new v0.41 two-session contract. It still requires an authentic reviewed lockfile to pass.
- `tools/release-readiness-v41.cjs` is a **read-only prerequisite report**. It checks current Node version, static workflow completeness, lockfile graph, installed core modules, build outputs, 18 migration source fingerprints, and locally present configuration without connecting to a DB or disclosing secrets. It always returns `productionApproved:false` and explicitly lists live gates.
- `tools/e2e-pg-shared-counter-v41.mjs` connects to **two separate PostgreSQL client sessions** on a confirmed disposable loopback `_ci` / `_test` database. It creates an unpredictably named isolated schema, applies the *unchanged* migration `018_recipient_attempt_windows.sql` against a minimal fixture table in that schema, and races ten increment requests. It checks both clients see 10, the cap rejects an 11th attempt, tenant mutation and deletion are rejected, and the isolated schema is dropped on exit. This is not a two-NestJS-instance HTTP test.
- `tools/two-client-policy-v41.cjs` validates explicit opt-in flags and schema-name safety before importing the database driver or connecting. The runner never touches real organization, issued report, or recipient tables.
- `tools/tests-v41/*.test.cjs` covers missing suite injection, fail-open CI settings, unsafe DB connection policies, injection-safe temporary schema names, release preflight invariants and safety properties of the integration script.

## 3. Controls retained

The 18 existing migration SQL files and pinned SHA-256 fingerprints are **unchanged**. The domain layer remains separate from framework code. Report issuance, independent MFA approval, detached Ed25519 receipts, recipient credential separation, revocation and immutable issued evidence are carried forward unchanged. No new secret material or test customer records are included. GitHub Actions still starts a scoped disposable PostGIS database and uses single-run ownership markers for existing HTTP integration testing.

## 4. Safety and limits

Static CI checking establishes **configuration coverage**, not execution success. The v0.41 tests do not prove that dependency resolution, TypeScript type checking, actual Node runtime, application authentication or browser rendering work. The two-client database test requires a disposable local PostgreSQL instance with schema-creation permissions and the `pg` package; it has not been run in the artifact construction environment. Its multi-session contention tests do not establish correctness under two complete application server instances behind a load balancer.

The `.env.example` contains illustrative placeholders. For real usage, supply fresh, different secrets via a proper secrets manager. Do not commit `.env`, signing keys, owner records, ID documents or production database URLs. Prioritize credential recovery, backups and external security review before customer rollout.

## 5. Production gate policy

An acceptable release candidate requires **all** of: authentic reviewed npm lockfile committed to the repository; `npm ci`; API and web builds; the full offline version matrix; real PostgreSQL migrations and live contract tests against an authorized disposable database; authenticated independent admin and recipient Playwright walkthroughs; two actual API instances sharing PostgreSQL; HTTPS/reverse-proxy abuse controls; verified restore drills; signing key custody/rotation; and applicable Uganda legal/privacy and partner-source approvals. No single green unit test clears these gates.
