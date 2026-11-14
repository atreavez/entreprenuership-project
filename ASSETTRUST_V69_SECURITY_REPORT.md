# AssetTrust v0.69 — Security and Release Gate

**Date:** 12 November 2026  
**Decision:** **NO-GO** for production.

## New controls and evidence

- Controlled real HTTP authorization acceptance harness, which is *not* allowed to run against production, remote DB hosts, remote APIs or unnamed test processes.
- Distinct loopback disposable PostgreSQL operator and restricted runtime role required before any fixture writes.
- API `healthz` ownership and version validated before `readyz`; `readyz` must prove all 27 migrations, 16 policy contracts and 13 protected tables.
- Synthetic two-organization admin and ordinary reviewer flows exercise platform/tenant authorization, cross-organization read/list denial, privileged write denial without MFA step-up, unassigned asset denial and revoked-token rejection.
- HTTPS redirects are never followed; client sends only to approved `127.0.0.1` origin with bounded JSON responses. API values and credentials are not written into report files; reports are private atomic 0600 files and reject symlink paths.
- CI runs the new authenticated acceptance on a randomly marked child API, using an independent restricted database login. Existing HTTP suites remain, with rate-limiter pacing and no security-bypass switch.

## Verified vs unverified

**Verified offline:** v0.69 simulated/contract suite **22/22**; all **67** current/historical `verify:v03` to `verify:v69` scripts exited zero in their final runs; static syntax/import, architecture and CI checks pass. The limited current-source scanner reported zero high-confidence secrets in 3,085 files.

**Not verified live:** installed-dependency API/web build; authentic complete lockfile; real Postgres/PostGIS role and tenant policy tests; v0.69 authenticated end-to-end test against a running API; ClamAV; actual browser sessions; HTTPS, reverse-proxy, SSH, MFA device enrollment, rate limiting in deployment, backup/restore, failover and independent penetration assessment. Production cannot be approved from mock HTTP tests.

## Mandatory security gates retained

- Real Argon2id/bcrypt password hashing and secure credential reset flows; no plaintext passwords.
- Admin MFA with current step-up, scoped RBAC and full audit trails. Separate global Platform Super Admin from organization administration.
- SQL parameterization, tenant data separation at database/service/query layers, authenticated negative RLS tests and fail-closed policy-inventory checks.
- Safe file upload types/sizes, encrypted private document storage, ClamAV clean/threat verdicts, no secrets in browser output or client logs.
- CSRF controls on cookie-authenticated requests, HttpOnly/SameSite refresh cookies, short-lived access/reset credentials, login rate limits and account suspension enforcement.
- Private PostgreSQL and SSH access, HTTPS everywhere, secure production headers, disabled production debug modes, protected signing keys, provider credentials kept server-side.
- Genuine npm lockfile, production dependency audits, historical Git secret scans and rotation of previously exposed credentials.
- Real API/frontend builds, browser/integration/adversarial tests, rollback rehearsal, backup restore, deployment monitoring and formal security review before release.

No migration or RLS policy is relaxed by v0.69. This version must be treated as **development-only** until full runtime evidence is obtained.
