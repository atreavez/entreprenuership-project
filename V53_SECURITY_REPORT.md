# AssetTrust v0.53 — security review

**Assessment date:** 11 November 2026  
**Overall release decision:** **NO-GO** — retain development-only status.

## Confirmed security/reliability finding corrected

**High — the CI workflow was invalid YAML.** Earlier v0.52 code had two incorrectly indented `CLAMAV_TCP_PORT` lines inside the environment sections for v0.49 and v0.50 PostgreSQL test steps. A real YAML parser rejected the workflow, so the claimed checks could not be reliably enforced by GitHub Actions. v0.53 fixes that issue and adds a preinstallation syntax-and-semantics gate that rejects duplicate keys, skipped SQL/version tests, disabled malware/secret-history checks and missing explicit mutation authorization. This is verified locally by Ruby/Psych and PyYAML, not by a completed remote CI job.

**Medium — the supervised Kali `--full` plan omitted HTTP/multi-process suites.** The prior v0.51 plan contained build and SQL contract suites but did not include `test:e2e:two-api:v42` or `test:e2e:ci`. Those are now mandatory, explicitly guarded test stages. The local result completeness checker requires their successful exit codes and an exact ordered report.

## Controls verified offline

- v0.53 adversarial workflow/evidence suite: **18 passed, 0 failed**.
- Historical and current version suites v0.03–v0.53: **51 passed** (separately recorded runs).
- CI coverage, actual YAML parser, architecture, 104-source syntax scan and offline smoke: **PASS**.
- Pinned SQL source checksums: **25/25 match**. No v0.53 migration.
- Current snapshot high-confidence secrets scan: **2,158 files checked, 0 findings**. No historical scan.
- Missing live evidence correctly returns **NO-GO**, requiring the original repo, an authentic lockfile, and a complete ordered test result.

## Outstanding release blockers

1. Missing genuine npm lockfile and installed dependencies. `npm ci --offline` is blocked; full build failed due to missing NestJS and Node types. No dependency vulnerability audit could complete.
2. No live ClamAV daemon or verified signature update. The real EICAR self-test failed here; production uploads must remain fail-closed.
3. PostgreSQL integration tests, RLS isolation, migrations, two-process and HTTP test suites not run against a real disposable PostGIS database here.
4. The complete original Git history and any actual leaked-secret rotations were not examined.
5. Production HTTPS, firewall/SSH, credentials, backups, data isolation for remaining tables, browser/MFA flows and independent adversarial testing not verified.

**Final verdict:** The source checkout has a corrected and tested CI configuration plus stricter local evidence gates. It is **not a tested production deployment**. Do not host sensitive land documents, public customer services or paid verification until every mandatory security release gate is satisfied with real deployment evidence.
