# AssetTrust v0.84 — Kali Linux Build and Security Acceptance

Use **trusted Kali Linux**, Node.js 22.12 or newer, and only an explicitly scoped disposable local test environment. Never reuse a customer, production or shared development database. Do not share real passwords, OTP seeds, recovery codes, refresh cookies or reset links as evidence.

## 1. Extract and verify offline security tests

```bash
cd /path/to/assettrust-v84
node --version
npm run verify:v84
npm run verify:v83
npm run verify:v82
npm run verify:architecture
npm run verify:syntax
npm run build:imports:v80
npm run verify:ci:v53
```

The new v84 suite covers revoked/suspended users, stale-password MFA disable, expired/revoked sessions, transaction ordering, audit failure rollback and non-replayable TOTP steps. **A passing offline test does not prove the full application compiled or the real database behaved correctly.**

## 2. Obtain audited dependencies and compile

Prefer the genuine, code-reviewed `package-lock.json` from the original Git clone, consistent with these v0.84 manifests. For a fresh archive **only if no reviewed lockfile exists**, the project's guarded bootstrap may generate a real lockfile on a trusted network-connected machine:

```bash
ASSETTRUST_V55_CREATE_LOCKFILE=YES npm run lockfile:generate:v55
npm run lockfile:check:v55
npm ci
npm audit --omit=dev --audit-level=high
npm run build
npm run build:artifacts:v56
```

Do not overwrite a reviewed lockfile or suppress failing exit codes. Stop on the **first meaningful** dependency, TypeScript or policy failure and capture a redacted log. In the authoring environment, npm registry access was unavailable; these operations were **not** completed.

## 3. Prepare a disposable live test environment

Review `V70_KALI_VALIDATION.md`, `V71_KALI_VALIDATION.md`, `V73_KALI_VALIDATION.md`, `V77_KALI_VALIDATION.md` and `V78_KALI_VALIDATION.md` included in this archive. Begin with read-only planning:

```bash
npm run kali:integration:plan:v70
npm run kali:acceptance:plan:v73
npm run kali:disputes:plan:v77
npm run kali:migrations:plan:v78
```

Follow their explicit opt-in and scoping instructions, including localhost-only disposable PostGIS, restricted non-owner runtime database role, real ClamAV and private generated test credentials. Do not bypass release guardrails.

## 4. Live v0.84 MFA cases — synthetic accounts only

Use a disposable organization with one MFA-enabled client and one mandatory-MFA administrator, plus a second separate organization for tenant isolation. Record only redacted response classes, sanitized error codes, transaction outcomes, and aggregate DB state.

1. Start an MFA disable with the old password while concurrently changing/resetting the password on another connection. If the password change commits first, the disable must fail. If disable obtains the account lock first, the password change must serialize and neither operation may partially commit.
2. Suspend the user while their MFA step-up is pending. After the suspension commits, the step-up must fail and not advance `last_used_step` or write `mfa_verified_at`.
3. Revoke or expire the current session before step-up and before MFA confirmation. Both must fail, with no proof, recovery-code creation or usable MFA state accidentally committed.
4. Attempt TOTP replay in two simultaneous requests against the same MFA credential; at most one may consume that step. No partial state or replay counter may commit on rejected requests.
5. Run MFA confirmation concurrently with session revocation and password reset. A revoked/expired session must not be used to confirm enrollment; on errors, all enrollment/recovery/audit writes must roll back.
6. Attempt to disable MFA from a current organization administrator even if the historical `admin_mfa_required` flag is false. It must remain forbidden.
7. Verify a valid client who knows the current password and TOTP can deliberately disable optional MFA, clearing all session MFA proofs and revoking other sessions.
8. Verify ordinary user login, founder MFA onboarding, recovery-code use, cross-organization access denial, privileged audit trace, and secure cookie/CSRF handling through the real browser and API.

Test both a valid runtime user with restricted RLS privileges and a deliberately unauthorized/cross-tenant actor. Do **not** simulate a passing SQL result where a real PostgreSQL row lock, wait or rollback must be verified. Capture deadlocks/timeouts as unresolved defects; do not reclassify them as PASS.

## 5. Release decision

A production release is **NO-GO** until an authentic lockfile, clean vulnerability audit, actual API/web compilation, PostgreSQL/HTTP/browser concurrency acceptance, full history credential scan and rotation, tenant/RLS isolation, HTTPS, upload scanning, payment/price verification, operational recovery drills and independent security review all pass without critical/high open findings.
