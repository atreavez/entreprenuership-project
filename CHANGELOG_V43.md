# AssetTrust v0.43 - Security release hardening (11 November 2026)

**Status:** Offline-tested development checkpoint, **NO-GO for production**.

### Implemented

- Added framework-independent exact-Origin and Fetch Metadata policy; cookie refresh now fails when Origin is missing or not in approved allowlist.
- Default production API bind changed to localhost and new runtime checks reject unacknowledged public binding, debug mode or preview mode.
- Tightened example Caddy security headers for HTTPS deployments.
- Added high-confidence source scanning, Git-history inspection mode, secure CI checkout and production dependency-audit step.
- Added 20-control cross-project finalization standard, portable Codex/Claude prompt, strict release audit and Kali validation guide.
- Added eight new security regression tests, including deliberate bad Origin variants and secret-fixture probes.
- Updated legacy v0.18/v0.19/v0.20/v0.27/v0.29 isolated test adapters and integration browser-Origin fixture, preserving historical coverage.

### Test results

- 8/8 new tests passed; 41/41 offline version commands passed; 93 TS/TSX syntax files scanned without diagnostics; architecture tests passed.
- High-confidence source/working-tree secret scan found no matches in more than 1,500 inspected text/source files. **Full Git history is NOT available in this ZIP**, and no keys were rotated.
- `npm ci` and `npm audit` cannot run because a genuine `package-lock.json` is not present. No live PostgreSQL/two-API/browser/TLS tests were run.

### Release blockers

- Missing complete single-use expiring password reset; unavailable full Git history and external secrets scanner; missing dependency lockfile, upgrades and audit; tenant/DB role/RLS verification; upload malware controls; production TLS/firewall/SSH verification; distributed login rate limiting and full authenticated browser security tests.
- Strict `npm run security:release:v43` intentionally fails until these are fixed and independently verified.

Read `V43_ASSETTRUST_SECURITY_REPORT.md`, `SECURITY_FINALIZATION_STANDARD.md`, `CODEX_CLAUDE_SECURITY_FINALIZATION_PROMPT.md`, and `V43_KALI_SECURITY_VALIDATION.md`.
