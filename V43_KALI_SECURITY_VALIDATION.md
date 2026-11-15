# AssetTrust v0.43 - Kali security validation and deployment checklist

Use this on a local clone of the actual project. This document does **not** authorize any test against production or any SSH/firewall change that could lock out the operator. All work must be performed in a dedicated branch with a backup.

## 1. Read-only source and history checks

```bash
cd /path/to/assettrust
node --version
npm run verify:v43
npm run security:scan:v43
npm run security:audit:v43
npm run verify:architecture
npm run verify:syntax
# Make sure this directory is a full Git clone, not an exported ZIP.
test -d .git && git rev-parse --is-shallow-repository
# Fetch history safely in the canonical repository; review remote configuration first.
git fetch --all --tags --prune
npm run security:scan:v43 -- --history
# Run a current, verified Gitleaks/TruffleHog binary as a second independent full-history scan.
# Example with installed Gitleaks:
gitleaks git --source . --redact --report-format json --report-path security-history-findings.json
```

High-confidence source and history checks do not replace review of source maps, settings, CI logs, deleted branches, or cloud provider secrets. **Never paste detected key values into a report.** If a leak is confirmed, rotate at provider and invalidate affected sessions first; consider history rewrite only afterward with the team.

## 2. Build and dependency audit

```bash
# An authentic reviewed package-lock.json must be generated from trusted package registries.
# Do not invent, truncate, or commit a bogus lockfile.
npm install --package-lock-only
# Review package changes before committing lockfile.
npm ci
npm audit --omit=dev --audit-level=high
npm test
npm run build
```

High/critical dependency alerts must be investigated and patched, with regression testing. Identify and remove unused packages only after checking imports, builds and runtime behavior. Review SBOM, frontend bundle and source maps for secrets.

## 3. Disposable database and multiple API servers

Follow `V42_KALI_VALIDATION.md` for its authorized disposable-database preparation, migrations, two API processes, and concurrency tests. Use *only* a disposable named test database, never production, and keep real encryption keys/backups safe. Test user/tenant separation using separate organizations and roles. Verify MFA, refresh cookies, case access, documents, report sharing and admin privileges. A real browser and HTTPS ingress are required to clear the final deployment gates.

## 4. HTTPS / SSH / firewall

- Deploy a proper HTTPS hostname with managed TLS certificates and automatic HTTP-to-HTTPS redirection; test renewal and `curl -I https://YOUR-HOSTNAME` for HSTS, no-store on private API responses and other security headers.
- Run the API only on `127.0.0.1` if reverse proxy is on same host; when container topology requires `0.0.0.0`, publish it only to a **private** service network and enable the explicit private-proxy acknowledgement. Do **not** expose port 4000 to the public internet.
- Allow 443 and (if certificate validation/redirect needs it) 80. Block PostgreSQL 5432 from external internet access. Do not expose management UIs.
- **Before touching SSH:** verify console/BMC/VPN/bastion access and a tested rollback. Prefer cloud perimeter firewall or VPN restriction on 22. If an approved SSH route remains, enforce keys-only, no root login, IP allowlisting, audit and patches. Do not run a blind `ufw deny 22` while remotely connected without a tested alternative.

## 5. Actual production security release gate

```bash
npm run security:release:v43
```

**Expected right now: nonzero exit / NO-GO.** Production release may proceed only after a future patch implements and independently verifies missing controls, updates the evidence checklist, and makes this strict gate pass. Do not edit gate code to declare PASS without supporting tests.
