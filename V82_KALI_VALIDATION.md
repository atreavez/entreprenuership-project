# AssetTrust v0.82 — Kali Linux Build and MFA Acceptance

This is a **non-production** guide for a **trusted local fresh extraction** named `assettrust-v82`. It must not run destructive tests against an existing customer database, public service, remote PostgreSQL instance, or production system. Real HTTP and database checks are pending until performed on the machine that hosts the disposable environment.

## 1. Offline checks (no DB writes)

```bash
cd /path/to/assettrust-v82
node --version                  # >=22.12
npm run verify:v82
npm run verify:architecture
npm run verify:syntax
npm run build:imports:v80
npm run verify:ci:v53
```

Expected for the published source checkpoint: 45 v0.82 tests and no architecture, syntax, import or CI-contract issues. These checks do **not** prove TypeScript semantic compilation or runtime functionality.

## 2. Reviewed dependencies and actual builds

Do **not** replace a reviewed lockfile from an original Git checkout. For a *fresh ZIP only*, which contains no lockfile, the repository's guarded bootstrap allows creation using npm registry resolution on a trusted connected Kali host:

```bash
ASSETTRUST_V55_CREATE_LOCKFILE=YES npm run lockfile:generate:v55
npm run lockfile:check:v55
npm ci
npm audit --omit=dev --audit-level=high
npm run build
npm run build:artifacts:v56
```

If any step fails, stop. Do not manually invent or weaken integrity hashes, ignore a vulnerability, fabricate an npm lockfile, or label any offline typecheck a real build. Preserve the *first meaningful compiler error*, with secret values redacted, for targeted remediation. Re-run both API and web builds after each correction.

## 3. Isolated PostGIS / ClamAV functional acceptance

Review `V70_KALI_VALIDATION.md`, `V71_KALI_VALIDATION.md`, `V73_KALI_VALIDATION.md` and `V77_KALI_VALIDATION.md` included in this archive. The existing supervisor uses a disposable local database, explicit confirmations, private generated keys, restricted non-owner runtime role, RLS verification and loopback-only test API.

Start with **read-only planning**:

```bash
npm run kali:integration:plan:v70
npm run kali:acceptance:plan:v73
npm run test:e2e:auth-control:plan:v69
npm run test:e2e:documents:plan:v73
```

Follow the v0.70 environment provisioning and authenticated acceptance instructions; do not repoint those commands to a shared or existing application database. The now-updated synthetic test journeys automatically enroll fictional founder accounts through the MFA endpoints, and do **not** persist OTP setup secrets/recovery codes to test evidence.

## 4. Mandatory live v0.82 MFA scenarios

Run these with **fictional accounts and data only** on the approved disposable local API:

1. Create a new organization administrator and verify the returned `adminMfaRequired` flag is true and `adminMfaEnrolled` is false.
2. Confirm `/api/v1/auth/me` and MFA setup endpoints are available to the restricted provisional token, while `/assets`, `/cases`, privileged settings and confidential documents return **403**.
3. Enroll TOTP using the correct password, confirm a valid six-digit code, and save recovery codes privately. Confirm the *same* active session then passes appropriate authorized endpoints.
4. Attempt an admin MFA-disable action. It must fail even for a legacy account with the historical admin MFA flag set to false.
5. Create two independent administrator sessions. After MFA is enabled in one, prove the other **cannot** access data or refresh into elevated authorization without its own MFA proof; a fresh password/MFA login should succeed.
6. Confirm a non-admin client can use ordinary permitted features without mandatory MFA and cannot call admin routes.
7. Revoke a session, suspend/demote administrators, perform cross-tenant attempts and confirm access denial. Recheck session proof after refresh and password change.
8. Check the real second administrator approval and 5-/15-minute MFA step-up boundaries. Recent MFA enrollment counts as a fresh verification timestamp, so do not mistake expected recent-MFA behavior for a bypass.

Do **not** put TOTP keys, credentials, raw cookies, JWTs, recovery codes or database passwords into screenshots, bug reports, chat, CI logs or repository files.

## 5. Final gate

Production status is **NO-GO** until the actual lockfile/audit, successful API+web build, disposable PostgreSQL/HTTP/browser tests, independent security review, history secret scan, TLS and deployment checks all pass. Report the first failing live stage before adding more source milestones.
