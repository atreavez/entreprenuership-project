# AssetTrust v0.83 — Kali Linux Validation Guide

Use a **trusted Kali machine** and **disposable local test environment only**. Do not point this source archive, migrations or mutation tests at a live customer database, the existing development database, public production services, or an unreviewed third-party instance. Never share raw tokens, passwords, authenticator setup keys, recovery codes or cookies in bug reports.

## 1. Confirm source and offline tests

Extract the checkpoint ZIP and enter the `assettrust-v83` directory:

```bash
node --version                  # Node >=22.12
npm run verify:v83
npm run verify:architecture
npm run verify:syntax
npm run build:imports:v80
npm run verify:ci:v53
npm run build:source:v56
```

The authoring checkpoint's offline evidence is 29/29 v0.83 tests and 43/43 version suites v0.41–v0.83, with 844 counted cases. **Do not infer full compilation from transpile-only checks.**

## 2. Obtain a genuine npm dependency lockfile and build

**Prefer the reviewed `package-lock.json` from the original Git repository**, if available and matching the updated manifests; do not overwrite it casually. This fresh ZIP intentionally does not include one. On a trusted network-connected machine, the project's guarded workflow can create one for an isolated fresh extraction:

```bash
ASSETTRUST_V55_CREATE_LOCKFILE=YES npm run lockfile:generate:v55
npm run lockfile:check:v55
npm ci
npm audit --omit=dev --audit-level=high
npm run build
npm run build:artifacts:v56
```

If any command fails, stop and record the first meaningful error with secrets removed. Do not add `|| true`, suppress failing tests, invent a lockfile, or label missing dependency/type errors as fixed source compiler problems. As of v0.83 authoring, the npm registry returned DNS `EAI_AGAIN`, and genuine compilation could not run.

## 3. Disposable database and existing supervised integration

Read `V70_KALI_VALIDATION.md`, `V71_KALI_VALIDATION.md`, `V73_KALI_VALIDATION.md`, `V77_KALI_VALIDATION.md` and `V78_KALI_VALIDATION.md` in this archive. Review and use existing **read-only planning** first:

```bash
npm run kali:integration:plan:v70
npm run kali:acceptance:plan:v73
npm run kali:disputes:plan:v77
npm run kali:migrations:plan:v78
```

The supplied setup separates the disposable PostGIS database from the normal dev database, requires explicit local opt-in for mutation, verifies a restricted runtime role and maintains private generated test credentials. Do not bypass its scope guards.

## 4. Live v0.83 credential-lifecycle scenarios (fictional accounts only)

Test on a compiled API backed by disposable PostgreSQL, recording sanitized status codes and final database rows without secrets:

1. **Change a password after challenge issuance.** Login with the old password to receive an MFA challenge, change the account password in an already verified session, and attempt to finish that old challenge. It must fail; the challenge must have `consumed_at` set.
2. **Unused password-reset link invalidation.** Obtain an authorized *synthetic test* reset link, change the password normally, then try the old unused link. It must fail, with the reset request revoked. No raw reset token belongs in test evidence.
3. **Login versus password change.** Start password login and credential change concurrently against the same account. After the password-change transaction commits, no session or challenge based on the old hash may be created. Confirm lock wait/timeout behavior without making the test non-deterministically pass.
4. **Login versus MFA confirmation.** Have a non-admin opt into MFA while a password login is in progress. Once the MFA activation commits, new logins must require the authenticator; older sessions must be revoked under the existing policy.
5. **MFA redemption versus reset.** Race MFA challenge completion and account password reset. No post-reset session may be issued through a pre-reset challenge.
6. **Fault injection.** Force error in pending-challenge invalidation and pending-reset-request invalidation inside password change. Verify the entire password mutation rolls back with no partial commit.
7. **Tenant and role isolation.** Run an independent second organization; verify it cannot read or revoke sessions, challenges or reset requests belonging to the first organization. Verify demoted/suspended administrators remain denied.
8. **Normal-user regression.** Confirm legitimate clients, reviewers and MFA-protected organization administrators can still sign in, refresh correctly, change password and complete their authorized journeys.

A timeout, unverified DB state or any inconclusive concurrency result is **NOT PASS**. Protect MFA and password-reset evidence; screenshots should mask all tokens.

## 5. Release gate

Production remains **NO-GO** until a reviewed lockfile, clean audit, successful API/web compilation, real PostgreSQL/HTTP/browser tests, full-history secret scan, administrator MFA, RLS and multi-tenant enforcement, secure TLS/deployment and independent adversarial security review have produced positive evidence. Preserve the first actual failure for targeted remediation.
