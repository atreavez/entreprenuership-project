# AssetTrust v0.43 - Security hardening checkpoint

## Implemented source changes

- Refresh-cookie POST now requires a syntactically valid exact allowlisted Origin; rejects missing Origin and cross-site/same-site Fetch Metadata indicators. Retains HttpOnly / SameSite Strict and Secure-in-production cookie behavior. Other bearer-token endpoints retain their existing authorization guards.
- Production API defaults to loopback (`127.0.0.1`) instead of all interfaces. Binding publicly requires deliberate `API_BIND_HOST` and `ASSETTRUST_PRIVATE_PROXY_NETWORK=YES` opt-in, and is safe only with verified private-network firewalling.
- Production config rejects enabled DEBUG and frontend demo-preview switches. Caddy example supplies HSTS, nosniff and no-referrer headers; TLS ingress is not tested from this environment.
- Dependency-free source secret scanning and optional full-Git-history scan. Reports only match types and paths/object IDs, not secret strings. Does not replace mature secrets scanners.
- CI now checks v0.43 and runs source/history secret scanning and production dependency audit; checkout requests full history. CI remains blocked until a genuine lockfile and real dependency installation exist.
- Reusable cross-project security standard and ready-to-use Codex/Claude finalization prompt, with 20 mandatory gates.

## What did NOT happen

- No cloud account or actual provider keys were accessible; no keys were rotated or revoked.
- No `.git` directory existed in this archive, so the complete Git history was NOT scanned here.
- Dependencies and PostgreSQL were not installed/accessible; full application build, live DB/HTTP/browser/TLS tests were NOT completed.
- PostgreSQL row-level security was not retrofitted. Existing tenant-filtered queries are not a substitute for a tested DB policy.
- No finished password-reset delivery and consumption workflow is present; no fake email/reset endpoint added.
- Malware scan/sanitization and complete payment pricing flows require separate implementation and tests.
- No host SSH/firewall change was made; do not lock an operator out without verified alternative access.

## To validate on Kali and canonical Git clone

```bash
cd /path/to/assettrust-v43
node --version
# Finalization must remain NO-GO until this becomes green with evidence:
npm run security:release:v43  # currently deliberately returns a failure
npm run verify:v43
npm run security:scan:v43
# Only in a FULL Git clone with .git refs (not exported ZIP):
git fetch --all --tags --prune
# Ensure not shallow: git rev-parse --is-shallow-repository  (must be false)
npm run security:scan:v43 -- --history
# Independently run an up-to-date Gitleaks/TruffleHog full-history scan.
# Generate and COMMIT a genuine reviewed package-lock.json using trusted registry.
npm ci
npm audit --omit=dev --audit-level=high
npm run build
npm test
npm run verify:architecture
npm run verify:syntax
# Follow V42_KALI_VALIDATION.md for explicitly authorized disposable DB + two API tests.
# Never run mutation suites against production.
```

**Release decision: NO-GO.** This checkpoint contains targeted source hardening and tests, not complete proof of secure commercial deployment.
