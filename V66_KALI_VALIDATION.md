# AssetTrust v0.66 — Kali Linux Build and Live Acceptance Guide

**Staging/disposable test only.** Preserve the trusted Git checkout; extract the v0.66 ZIP to a separate directory. Do not use production/customer data, a public PostgreSQL endpoint or customer credentials. Never send `.env`, private keys, connection strings, or raw server logs to chat.

## 1. Extract and inspect

```bash
mkdir -p ~/Projects/assettrust-v66
unzip ~/Downloads/AssetTrust_v66_Continuous_RLS_and_Two_API_Readiness_Checkpoint.zip -d ~/Projects/assettrust-v66
cd ~/Projects/assettrust-v66/assettrust-v66
node --version
npm --version
npm run verify:v66
npm run diagnose:inspect:v65
npm run readiness:two-api:plan:v66
npm run build:source:v56
```

The `diagnose:inspect:v65` command only checks local prerequisites. It is not a PostgreSQL or build proof.

## 2. Install authentic reviewed dependencies and build BOTH apps

From the source folder, after inspecting the package manifests and comparing them to your original trusted repository:

```bash
# ONLY when no reviewed package-lock.json already exists:
ASSETTRUST_V55_CREATE_LOCKFILE=YES npm run lockfile:generate:v55
npm run lockfile:check:v55
npm ci
npm audit --omit=dev --audit-level=high
npm run verify:v66
npm run verify:architecture
npm run verify:syntax
npm run build
npm run build:artifacts:v56
npm run release:preflight:v51
```

If any command fails, stop at that step, preserve its **first redacted error** and correct the actual cause. Never fake a lockfile, run `npm install --force` blindly, override dependency engine rules, use `|| true` or disable a security guard to manufacture a PASS. Record `node -v`, `npm -v`, `npm run build` exit code and a sanitized error excerpt. Check in the authentic lockfile to your original Git repository only after review.

## 3. Provision disposable local PostGIS + restricted runtime role

Follow `V57_KALI_VALIDATION.md` through `V65_KALI_VALIDATION.md` in the package. Use only a fresh loopback database named `assettrust_test` or `assettrust_ci`. Use separate migration/operator and non-owner runtime credentials. Review and apply all **27 existing** migrations and verify their recorded SHA-256 values. No new schema migration is introduced by v0.66.

Only after validating the target and privately loading secrets, run the existing explicit-gated test sequence (see previous stage documents for all suite-specific confirmations):

```bash
export CI=true NODE_ENV=test
export ASSETTRUST_E2E_ALLOW_MUTATION=YES
export ASSETTRUST_V57_ENFORCE_RUNTIME_ROLE=YES
export ASSETTRUST_V58_SEEDED_RLS_CONFIRM=YES
export ASSETTRUST_V59_CRUD_CONFIRM=YES
export ASSETTRUST_V62_OPERATIONAL_RLS_CONFIRM=YES
export ASSETTRUST_V63_POLICY_CONFIRM=YES
# Privately configure DATABASE_URL and ASSETTRUST_RUNTIME_DATABASE_URL
# Complete the other existing v51-v64 approvals from the handover docs.
npm run integration:database:v64
```

A fresh RLS policy weakening or an unauthorized runtime DB role must be rejected. Do not edit a production policy to test drift. Perform any negative tests only on reviewed disposable fixtures.

## 4. Two *real* local NestJS API instances — v0.66 acceptance

After successful builds and disposable DB setup, use the existing **v0.42 process supervisor**, which creates separate unpredictable API ownership markers and starts two API processes. Enable the **new v0.66 acceptance** inside that supervisor:

```bash
export CI=true NODE_ENV=test
export ASSETTRUST_V66_HTTP_CONFIRM=YES
export ASSETTRUST_V42_TWO_API_CONTRACT=YES
export ASSETTRUST_E2E_ALLOW_MUTATION=YES
export ASSETTRUST_V57_ENFORCE_RUNTIME_ROLE=YES
# Complete all v0.42 environment prerequisites, including the disposable
# loopback database and its private runtime credential, from V42/V65 guides.
npm run test:e2e:two-api:v42
```

The supervisor runs its existing negative recipient checks and the new v0.66 two-instance readiness contract. It **does not** approve a production release. Avoid manually launching servers on public interfaces. If two independently trusted, locally started test instances already exist, a standalone **read-only** check is available using `ASSETTRUST_V66_HTTP_PORTS` and `ASSETTRUST_V66_EXPECT_TARGETS` (two different 16+ character unpredictable API-owned markers) plus the confirmations above:

```bash
npm run readiness:two-api:check:v66
```

The manual read-only check only accepts `http://127.0.0.1:<port>` with two distinct nonprivileged ports, rejects proxy environments and redirects, and stores only sanitized status flags under `test-evidence/v66/two-api-readiness.json` (mode 0600). Never use it as a substitute for authorization or PostgreSQL negative tests.

## 5. Runtime drift negative tests and frontend acceptance

In a completely disposable staging database only, with the correct role and all 16 policies initially applied, exercise `/api/v1/readyz` from both API instances: HTTP 200 must include the running v0.66 version, `migrationsVerified:27`, `security:rls-policy-contract-verified`, `rlsPoliciesVerified:16`, and `protectedTablesVerified:13`.

After a controlled, reversible test-only alteration such as adding a policy to a disposable protected table, the next `/readyz` must be non-200. Restore the original reviewed migration/policy state and reverify. Never change a live production database to demonstrate this. Also verify normal admin access and that a non-admin cannot fetch private integrations, cases, audit or other tenants' records. Open the **Deployment Readiness** page in a built frontend; ensure it shows policy count only after an actual successful API response and never treats a legacy incomplete readiness response as secure. Keep browser results and DB audit in separate evidence files.

## 6. Mandatory release security gate — remains NO-GO until proven

Require real auth, Argon2id password hashing, server-only secrets, scoped tenant access (DB/query/service), HTTPS, restricted SSH, validated requests, parameterized SQL, login throttling, CSRF protections where cookie authentication is used, safe single-use password-reset tokens, safe scanned uploads, admin MFA/RBAC/audit, server-authoritative settlement/pricing, no debug, audited dependencies, full original Git-history secret scan and rotation, full integration/adversarial tests, backups/restore drills, and release evidence review. Only the authorized release owner can approve after independent verification; CLI/readiness never does.
