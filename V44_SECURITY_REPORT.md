# AssetTrust v0.44 - Security Implementation and Test Report

**Review date:** 11 November 2026  
**Baseline:** AssetTrust v0.43 source checkpoint  
**Decision:** **NO-GO - NOT APPROVED FOR PRODUCTION**

## Executive findings

This checkpoint addresses one documented v0.43 P1 gap: the absence of a password-recovery workflow. The new flow uses short-lived single-use password reset tokens and server-only email delivery, with a database-level unique active-token invariant and a per-email (keyed pseudonym) request window shared by API instances. It also invalidates all existing login sessions and MFA-login challenges after a successful password reset. These are source-level improvements, **not proof of a deployed production-safe password reset**.

The real SMTP/HTTPS email provider, real email delivery, installed dependencies, live PostgreSQL, browser sessions, multi-server races and production ingress were not available in this environment. The full security release gate remains blocked. Do not infer that the app is unhackable or that all requirements are satisfied.

## Implemented source-level protections

| Control | v0.44 implementation | Evidence status |
|---|---|---|
| Token generation | Node crypto 32 random bytes, canonical URL-safe representation | Domain tests passed |
| Token storage | SHA-256 hash only; raw token sent only to delivery adapter | Unit tests and source review passed |
| Expiry | PostgreSQL `now()+15 minutes`, server checks expiry | Policy/unit tests passed; DB unverified |
| One-time use | Row-lock recheck, consumed timestamp and partial unique index | Service tests passed; DB concurrency unverified |
| Enumeration safety | Same public message for unknown accounts, throttling and successful requests | Unit tests passed; timing not measured live |
| Shared rate limiting | PostgreSQL 3 accepted reset requests per email identity per hour; HMAC keyed, not plain email | Unit and SQL contract reviewed; live unverified |
| Credential delivery | Explicit HTTPS server-only relay, redirect denied, request timeout, bearer secret, origin allowlist | Adapter tests passed; transport/provider unverified |
| Password storage | Argon2id new password hash, reuse check, validated 12-128-character input | Mock service + source checks passed; real Argon2 unavailable |
| Account/session invalidation | All refresh sessions and login challenges revoked in same DB transaction as credential change | Service test passed; HTTP/DB integration unverified |
| MFA continuity | Authenticator enrollment is preserved (reset does not disable MFA) | Source review; live MFA must be tested |
| CSRF/origin | Exact browser `Origin` and Fetch Metadata policy required on both public POSTs | Source contract test passed; live browser unverified |
| User interface | Sign-in recovery entry, token fragments removed from history, no token in HTTP URL | Source/UI checks passed; browser execution unverified |
| Auditing | Organization-scoped `PASSWORD_RESET_COMPLETED` audit event | Service test passed; live audit chain unverified |
| Migration integrity | New append-only `019_password_reset.sql`, prior 18 migration checksums unchanged | 19-file fingerprint match; deployment unverified |

## Actual tests executed

- **16/16 v0.44 offline tests passed.** Domain policy, relay behavior, service adapter with mocked database/Argon2/notification service, source contracts, and CI coverage.
- **42/42 offline version commands passed**, v0.03 through v0.44.
- **Architecture checks passed**; **98 TS/TSX files passed syntax/transpile checks**, which is *not* a complete TypeScript typecheck.
- Source scanner found **zero high-confidence matches**, scanning approximately 1,600 text/source files. This scanner is pattern-limited and not a replacement for full Git-history scanning or manual secret review.
- **Not run:** actual DB migration, disposable PostgreSQL reset contract, real Argon2 integration, email delivery, HTTPS/browser tests, full build or dependency installation.

## Outstanding mandatory security blockers

1. Generate and review authentic `package-lock.json` using a trusted package registry; run `npm ci`, full `npm test`, frontend/API build, `npm audit`, SBOM and vulnerability remediation. Do not fabricate lockfiles.
2. Apply new migration only to a backed-up, disposable test instance first. Run the v0.44 PostgreSQL contract, concurrent one-use reset attempts, login/refresh invalidation and full MFA flow in a real database.
3. Connect and validate a dedicated outbound HTTPS email relay. Its token must be server-side, its hostname/operator controlled; verify message delivery, abuse prevention, timeouts, retries, bounce handling and monitoring. Until then the reset request endpoint returns 503 (unavailable) for everyone.
4. Verify actual browser behavior and browser-history handling using automated end-to-end tests and malicious-origin requests. Prevent sensitive token capture by analytics, crash logs, proxies and third-party scripts.
5. Implement or verify complete tenant isolation (including DB privileges and RLS/defense-in-depth), distributed login rate limits, upload malware scanning, admin authorization, server-authoritative pricing, and system-wide SQL safety.
6. Scan the **entire Git history** from the canonical repository with a trusted current tool and rotate any exposed credentials at their original providers. This ZIP does not contain `.git`.
7. Verify TLS/HSTS, backups/restores, secrets manager, monitoring, outbound network restrictions, and SSH/firewall settings on actual infrastructure without locking out the operator.
8. Perform independent adversarial/security testing; stop production release for unmitigated critical/high findings.

## Security limitations and risks

- A credential-reset link confirms mailbox access, **not** legal identity or title ownership. A reset must not bypass MFA, which remains required where configured.
- Email-based reset requests can be deliberately throttled by an attacker. Further IP/device/organization-level distributed abuse monitoring may be appropriate.
- The reset throttle store accumulates keyed email identities; add a safe, audited retention/cleanup policy before scale.
- The provider relay runs on trust in server configuration and DNS/TLS; enforce controlled egress and review your trusted provider. No real provider keys were added or rotated.
- CI source checks cannot establish actual account isolation or production compliance.

## Release disposition

**NO-GO.** v0.44 is a development checkpoint. It closes some source-level password-reset gaps but **does not pass** the mandatory cross-project final security and production release gate. No network firewall, cloud account, vendor credentials or SSH service was changed by this work.
