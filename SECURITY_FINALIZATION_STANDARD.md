# Mandatory final security standard - all software projects

**Scope:** AssetTrust, NETOLA, Farmer's Pride, Campus Live, BursarPro, and every future project. This standard is a compulsory finalization gate, not a promise that any system is unhackable. Apply it during design as well as at release. Preserve DDD, TDD, SOLID, Clean Architecture, and security-by-design.

## Acceptance gates

1. **Real identity and authentication:** No fake login, front-end-only roles, hard-coded admin accounts or backdoor passwords. Verify identity where required; protect registration and recovery from enumeration, MFA-bypass and account takeover.
2. **Password storage:** Argon2id preferred (or appropriately configured bcrypt/scrypt); unique salts; never plaintext, reversible encryption, MD5 or SHA256 passwords. Password change revokes sessions. Test weak-password and credential-stuffing scenarios.
3. **Secrets and API credentials:** Backend-side only, provisioned by a secrets manager or environment. Never embed third-party privileged API keys or signing secrets into Vite `VITE_`, React, source maps, browsers, logs, mobile builds, frontend storage or client response payloads. Public client identifiers may be public; restrict them appropriately. Audit production bundles.
4. **Tenant and user isolation:** Authorization at request/use-case/repository layers; verify ownership on every ID, query, mutation and download. Use tenant predicates, least-privileged DB roles, and where feasible PostgreSQL RLS/FORCE RLS. Test horizontal/vertical privilege escalation, IDOR, cross-org access, staff removal, and race conditions.
5. **HTTPS only:** Automatic TLS, enforced HTTPS redirect, secure upstream routing, HSTS only after validation, verified cert renewal, WSS for WebSockets, and no public HTTP API ports. Block insecure cookies on HTTP. Test real deployed ingress.
6. **Server-side validation:** Validate, normalize and bound all fields, path parameters, query parameters, JSON, multipart data and webhooks. Never trust disabled UI controls. Protect against XSS, SSRF, command injection and dangerous deserialization.
7. **SSH/admin infrastructure:** Block public SSH (port 22) wherever an alternate console/VPN route exists. Otherwise restrict to a VPN or narrowly approved IPs, SSH keys only, no password/root logins, audit, patch and firewall. **Do not blindly close SSH before verifying alternate access.** Never expose database or debug ports.
8. **SQL injection:** Bound parameters/prepared statements with allowlisted identifiers for any dynamic SQL. No user-constructed query fragments or shell interpolation. Test `' OR 1=1 --`, identifiers, sorting and filters, and transaction boundaries.
9. **Login abuse controls:** Distributed per-account and per-network rate limits, exponential delays or challenge, lockout/alert thresholds, and MFA. Confirm across two API servers and reverse proxies, rather than a single-process counter.
10. **CSRF:** On cookie-authenticated state changes use CSRF tokens or strict server-verified Origin/Fetch Metadata plus SameSite restrictions; determine protections according to browser behavior. Test missing/spoofed Origin and cross-site forms. Never rely solely on CORS.
11. **Sessions/cookies:** HttpOnly, Secure, SameSite appropriate for flow, limited paths/domains, short access token life, rotating refresh token, logout/invalidate-all, revoked-session checks, no sensitive browser storage, robust session expiration and concurrency testing.
12. **Password reset:** Random high-entropy single-use token; store hash, not plaintext; expire within a short policy (e.g. 15 minutes); prevent enumeration; rate limit requests; invalidate tokens after use and revoke old sessions; never place secrets in analytics/referrer logs; send only through trusted provider with anti-phishing safeguards.
13. **Uploads:** Strict type allowlist, byte-size/count quotas, magic-byte validation, extension controls, sandbox/malware scan, PDF active-content checks, private encrypted storage, randomized file names, content-disposition attachment, signed/scoped downloads and no executable hosting. Test polyglots, huge files and EICAR test payloads only in authorized labs.
14. **Admin control plane:** Authentication, MFA with reauthentication for critical actions, least-privilege RBAC/ABAC, tenant vs global admin separation, dual authorization where necessary, no client-only route protection, append-only audit history, emergency access procedure and access review.
15. **Prices, billing and money:** Server-authoritative catalog/pricing/tax/discount/FX and immutable quotes. Recompute before checkout/settlement; verify provider webhooks by signatures, replay protection and idempotency; reconcile ledger and balances transactionally. Never accept browser-submitted totals as authority.
16. **Production mode:** Disable debug consoles, developer routes, detailed error traces, test seeds, demo credentials, verbose SQL and public OpenAPI/docs if not intended. Fail startup if environment is unsafe. Centralize redacted logs and alerts.
17. **Dependencies:** Commit authentic reviewed lockfiles; `npm ci`/equivalent; run SCA and production dependency audit with high/critical severity thresholds, upgrade verified vulnerable versions, remove unused packages, verify licenses and provenance, add automated update PRs and SBOM.
18. **Secrets history and rotation:** Scan full Git history including archived refs and tags with mature scanner (Gitleaks/TruffleHog), plus CI, config, builds and logs. If exposed, revoke/rotate with provider immediately, invalidate dependent tokens/sessions, verify replacements, document event, then consider history rewrite and coordinate clones. **Removing from Git history does NOT undo exposure or replace rotation.**
19. **Test and evidence:** RED->GREEN->REFACTOR proof where applicable; static, unit, integration, e2e, adversarial, permission matrix, fuzz/property tests where feasible, dependency audits, DAST, upload tests, failover/race, backup-restore drill and repeatable deployment smoke tests. Record commands, outputs, dates, target revision and environment.
20. **Release decision:** No deployment with open critical/high findings, unrotated leaked keys, unverified tenant isolation, unproven financial integrity, missing rollback path or absent production observability. Identify remaining medium/low risks, owners and remediation dates, and obtain independent review and release approval. Version checks alone never imply production readiness.

## Final deliverables per project

- Security inventory and threat model; explicit asset/API/role matrix, flow maps, trust boundaries and tenancy model.
- Implemented, code-reviewed fixes with test-first evidence; CI pipelines and lockfile/dependency vulnerability reports.
- Secret scanning results for working tree **and complete Git history**, with sanitized evidence and documented key rotation when necessary.
- Auth, authorization, CSRF, API/DB, uploads, payments and admin adversarial tests across multiple users/tenants and two server instances.
- Production deployment hardening (TLS, firewall/VPN/SSH, backup/restore, least-privilege DB roles, logging/alerting and incident runbook).
- Signed-off release report listing PASS / FAIL / NOT VERIFIED for each gate with commands and references. Any critical unknown is a release blocker.

## Security principles

Never claim '100% secure', 'unhackable', 'no vulnerabilities', 'production ready', or 'rotated keys' based solely on a static code scan or offline tests. Do not print secrets in reports or logs. Never run database-mutation tests against production or disable security controls to make tests pass.
