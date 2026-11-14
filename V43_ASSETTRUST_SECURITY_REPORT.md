# AssetTrust v0.43 - Application security hardening report

**Date:** 11 November 2026  
**Examined artifact:** AssetTrust v0.42 source checkpoint, upgraded to v0.43 in this review  
**Security release decision:** **NO-GO - NOT PRODUCTION READY**  
**Scope:** Static source review, targeted security patches, source-scanner tests, offline regression tests and release-process checks. **No live server, PostgreSQL, public HTTPS ingress, vendor accounts, complete Git history or authenticated browser was available.**

## Executive findings

AssetTrust already has real login and short-lived session capabilities with Argon2id password hashes, a rotating refresh credential, MFA controls, tenant predicates in reviewed SQL queries, parameterized SQL in reviewed components, encrypted evidence blobs, an upload-size limit, document-signature checks, and audit records. The source also has several application-layer and per-API-instance rate limits.

This is not enough to claim release safety. The required password-reset workflow does not exist, database RLS has not been established, upload malware checks are not proven, full Git history cannot be inspected from a ZIP without `.git`, and an authentic npm dependency lockfile is missing. HTTPS, firewall/SSH, backups, rate-limit coordination, tenant isolation and admin actions still require live testing.

## Source changes completed in v0.43

1. **Cookie/CSRF hardening:** the refresh route now requires an exact allowed `Origin`, rejects absent origin, rejects same-site and cross-site Fetch Metadata indicators, and rejects malformed/multi-value origins. The existing HttpOnly, SameSite=Strict, Secure-in-production cookie settings remain in place. The new origin policy lives in the framework-independent identity domain.
2. **Production API exposure:** the API now binds to loopback by default in production rather than `0.0.0.0`. An explicit wide bind is rejected unless `ASSETTRUST_PRIVATE_PROXY_NETWORK=YES` is set; this override is valid only for an independently firewalled internal network.
3. **Runtime safety:** production config now rejects debug-enabled startup and production design-preview setting.
4. **HTTPS example:** the Caddy configuration now includes HSTS, `nosniff` and `no-referrer` headers. Real host TLS and redirects remain unverified.
5. **Secrets scanning:** a dependency-free high-confidence scanner checks source content and sensitive filenames, redacting actual values. A full-history option fails closed if repository metadata is absent/shallow. CI checkout now requests full Git history, invokes the history scan and includes a production-dependency vulnerability audit step.
6. **CI/regression:** added `verify:v43`; updated five isolated historical authentication test fixtures to load the new origin-policy boundary, and adjusted an older CI-future-version test. Updated the disposable identity E2E fixture to use browser `Origin` for refresh.
7. **Portable standard:** added `SECURITY_FINALIZATION_STANDARD.md` and `CODEX_CLAUDE_SECURITY_FINALIZATION_PROMPT.md` for all current/future software projects.

## Verification performed

| Test / check | Actual result | Evidence and interpretation |
|---|---|---|
| v0.43 new security tests | **8/8 PASS** | Origin spoofing/missing-origin tests, production config, cookie contract, HSTS config, secret-fixture detection, source scan and CI policy. |
| All version checks v0.03 through v0.43 | **41/41 PASS** | Captured `test-evidence/v43/regression-results.json` and individual logs. These are offline/policy checks, not a live application build. |
| Architecture checks | **PASS** | `npm run verify:architecture`. |
| TypeScript / TSX syntax scan | **PASS (93 files)** | `npm run verify:syntax`, syntax only, **not full typecheck**. |
| High-confidence working-tree secret scan | **PASS: no matches in more than 1,500 text/source files** | `npm run security:scan:v43`; pattern-limited, excludes large map/binary assets, not full secret assurance. |
| Full Git history secret scan | **BLOCKED** | `.git` metadata not present. `npm run security:scan:v43 -- --history` exits nonzero. Requires canonical full Git clone plus independent scanner. |
| Authentic clean npm installation | **BLOCKED** | `npm ci` fails: no genuine `package-lock.json`. |
| Production package vulnerability audit | **BLOCKED** | `npm audit --omit=dev --audit-level=high` fails: ENOLOCK. Neither updates nor vulnerability clearance can be claimed. |
| Live PostgreSQL / browser / TLS / two-server access tests | **NOT RUN** | Dependencies and runtime infrastructure not available. |
| SSH/firewall and secret-provider rotation | **NOT RUN** | Host/cloud access and vendor credentials not provided. No confirmed leaked key to rotate in the scanned working snapshot. |

## Mandatory release control matrix

| # | Control | Assessment | Release action |
|---|---|---|---|
| 1 | Real authentication | Source present; live unverified | Exercise login, disabled users, MFA and session revocation on running servers. |
| 2 | Password hashing | Argon2id source present | Verify migration, no plaintext DB rows, secure password change. |
| 3 | Privileged API keys server-side | Partial | Audit Vite build, source maps, response payloads, integrations and logs. |
| 4 | Per-user and per-tenant database access | Partial | Implement/verify DB least privilege and RLS where appropriate; cross-tenant IDOR tests. |
| 5 | HTTPS/HSTS | Example hardened; live unverified | Test deployed certificates, redirects, proxy forwarding, WSS and HSTS. |
| 6 | Server-side input validation | Partial | Inventory and fuzz every route and file/form field. |
| 7 | Block public SSH | Unverified | Apply VPN/bastion/allowlist firewall after proving alternative management access. |
| 8 | Safe SQL | Parameter binding seen; whole-repo unverified | Review dynamic SQL paths, role grants, malicious input tests. |
| 9 | Login throttling | Single-instance throttle present | Add/test distributed per-account/per-IP control and proxy throttle. |
| 10 | CSRF | Origin patch unit-tested | Validate on real browser and ingress, including attacks and missing Origin. |
| 11 | Secure cookies | HttpOnly, SameSite Strict, production Secure in source | Validate actual Set-Cookie and behavior through TLS. |
| 12 | Password reset | **MISSING** | Implement hashed random single-use 15-minute tokens, anti-enumeration, throttle, trusted delivery, session revocation and tests. |
| 13 | Upload restrictions | Size/type/magic/at-rest encryption present | Add malware/active PDF inspection, quarantining, content controls and tests. |
| 14 | Admin access controls | Role/MFA/step-up source present | Full route authorization matrix and verified privileged action logs. |
| 15 | Server-authoritative pricing | Partial quote validation | Implement immutable priced catalog/quote policy and reprice at checkout; validate external payment signals if billing is added. |
| 16 | Production debug disabled | Config patch unit-tested | Verify deployed error handling, logs, admin debug endpoints and headers. |
| 17 | Vulnerable/unused packages | **BLOCKED** | Generate authentic reviewed lockfile; `npm ci`, audit, SBOM, upgrades and remove unused. |
| 18 | Git history secrets and rotation | **BLOCKED** | Full clone and Gitleaks/TruffleHog; rotate any confirmed exposure at original provider; invalidate sessions. |
| 19 | Integration/pen/security testing | Offline checks passed | Live DB, complete browsers, two servers, permissions, backups and DAST. |
| 20 | Release approval | **NO-GO** | Close all mandatory blockers, independent security review and documented go/no-go. |

## Urgent engineering backlog (priority order)

**P0 - Block release:** Obtain full Git history and scan it; generate an authentic lockfile and address high/critical CVEs; test real DB access boundaries, production HTTPS/TLS, session and CSRF behavior; establish recovery/backup and key custody; complete immutable audit trails and verify real MFA/admin permissions.

**P1 - Functional security gaps:** Implement a complete password reset and verified delivery workflow; distributed login abuse controls, DB least privilege/RLS, malware scanning and quarantine, and server-authoritative pricing/payment workflows before money collection.

**P2 - Operability:** Validate SSH/firewall without locking out the administrator, observe rate-limit alerts, conduct independent security review and repeated restore, incident and disaster-recovery drills.

## Kali / Codex / Claude handover commands

```bash
cd /path/to/assettrust-v43
npm run verify:v43
npm run security:scan:v43
npm run verify:architecture
npm run verify:syntax
# On the actual full Git repository, not an exported ZIP:
git fetch --all --tags --prune
git rev-parse --is-shallow-repository # must print false
npm run security:scan:v43 -- --history
# Also run a current mature history scanner (Gitleaks or TruffleHog) and review findings.
# Review dependencies, generate and commit a genuine npm lockfile, then:
npm ci
npm audit --omit=dev --audit-level=high
npm test
npm run build
# Disposable database and two-server tests: see V42_KALI_VALIDATION.md.
# Never run database-mutating test suites on production.
```

**SSH hardening guidance:** Confirm a working out-of-band console, VPN or bastion first. Then block public port 22 in the cloud network firewall and/or host firewall; if SSH must stay available, restrict it to approved VPN/IP sources, keys-only authentication and non-root accounts. Keep only 443 (and 80 if needed for certificate challenges/redirects) exposed, and never publish PostgreSQL port 5432 or internal API port 4000. These are operational instructions, **not applied changes**.

**Secret-leak response:** Record key type and affected service without printing secret. Immediately revoke/rotate via authorized provider console, deploy new server secret through secret manager, invalidate related sessions/tokens, retest functionality and scanning, document the rotation. Deleting/rewriting Git history alone does not secure exposed keys.

## Final verdict

**NO-GO for commercial/customer use.** This checkpoint provides meaningful, unit-tested source hardening and a repeatable security-finalization standard, but it does **not** establish that the deployed product is safe from attackers. No provider key was rotated and no live infrastructure policy was modified. Future Codex and Claude work must use the standard and not mark an item complete without test evidence.
