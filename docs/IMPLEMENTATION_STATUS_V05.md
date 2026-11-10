# AssetTrust v0.5 — Implementation Status and Next Engineering Gate

**Compiled by Aturinzire Hargreave | 6 November 2026**

| Area | Delivered in v0.5 | Still required before real production |
| --- | --- | --- |
| Login and registration | New password policy; MFA-aware login | Email ownership verification, anti-bot policy, rate limit across nodes |
| Session management | DB sessions; per-user session ownership; 15-minute JWTs; 7-day rotating refresh cookie, 30-day cap | HTTP/DB E2E validation; central session monitoring, security notifications |
| Logout | Single and all-session revocation; token replay revokes session | Production incident response and device anomaly detection |
| MFA | TOTP pending enrollment/confirmation, AES-GCM encrypted seed, replay defense, ten hashed recovery codes | Privileged-action MFA enforcement; key lifecycle rotation; external security review |
| Account password change | Current-password check, transactional row lock, Argon2id, revoke other sessions | Tested multi-device browser flow; email recovery and fraud controls |
| React | New Account Security screen and MFA login challenge, desktop/mobile source-derived preview | Real React runtime screenshots, accessibility audit and mobile usability testing |
| Clean Architecture | Identity domain policy, SessionUseCases and abstract ports, PgSessionRepository adapter | Move remaining auth orchestration into application use cases; refactor other contexts |
| TDD | 21 automated offline identity/session/security-source tests | Coverage of NestJS controllers, DB transaction concurrency, real HTTP and browser flows |
| Audit | MFA and password change events recorded locally | External anchoring, SIEM feed and security alerts |
| Official land verification | Not altered | Legal authority, government registry authorization, professional verification |
| Payments / subscriptions | Existing preview and quote models retained | Approved provider, ledger, reconciliation, tax/legal review |
| Hosting / operations | CI step for v0.5 tests and identity E2E included | CI execution, full build, secret management, backup/restore and penetration testing |

**Avoid claiming real-world validity** of a professional credential, land title, government record, payment, digital certificate, or blockchain proof until corresponding legally authorized integrations and evidence checks exist.

## Suggested v0.6 priorities

First get v0.5 passing the live PostgreSQL build and E2E test on Kali Linux. Then focus v0.6 on **verified professional accreditation, e-mail verification and recovery, privileged-action MFA, tenant isolation integration tests, permission matrix and policy engine, and stronger threat detection**. Maintain DDD/TDD/SOLID/Clean Architecture/security-by-design at every gate.
