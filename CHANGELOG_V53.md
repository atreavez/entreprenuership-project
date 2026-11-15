# AssetTrust v0.53 — CI integrity and supervised live-evidence gate

**Date:** 11 November 2026  
**Status:** Offline validation checkpoint; production release **NO-GO**.

## Changes delivered

1. Repaired **invalid YAML** in `.github/workflows/ci.yml`: two live PostgreSQL test steps had a misindented `CLAMAV_TCP_PORT` key. The prior workflow was rejected by real YAML parsers and therefore could not execute reliably.
2. Added `tools/workflow-policy-v53.rb` (Ruby standard-library Psych parser). Enforces syntactically valid YAML, rejects duplicate keys/aliases, verifies all declared version and PostgreSQL suites are executable, checks Git checkout depth, ClamAV service/contract, npm vulnerability audit, disposable database authorization and execution order before `npm ci`.
3. Added a CI **preinstall** YAML validation step, `verify:ci:v53`, and version-check script `verify:v53` with 18 targeted tests.
4. Extended the v0.51 supervised Kali **database and full** test plans to include both the actual two-NestJS-process test (`test:e2e:two-api:v42`) and supervised HTTP suites (`test:e2e:ci`). The runner now supplies a fresh cryptographically random run-ownership marker and explicit guarded test flags after verifying an authorized disposable database.
5. Added the read-only `evidence:review:v53` gate. It requires the complete expected ordered list of 88 supervised stages, explicit zero exit codes and private report permissions, including successful live scanner, builds, full Git-history scan, PostgreSQL migrations, two API instances and HTTP suites. This gate never grants production approval.
6. Updated historical test harnesses only where they asserted a now-obsolete plan length or hardcoded current version. **No prior SQL migration or customer data changed.**

## Verified here

- **18/18 new v0.53 tests pass.**
- **51/51 offline version-check suites** (v03–v53) pass in captured runs; interrupted batches were rerun in smaller groups.
- Real Ruby/Psych and Python YAML parsers accept the repaired workflow.
- CI coverage contract, architecture, syntax scan, source secret scan and offline smoke pass.
- **25/25 SQL migration source SHA-256 fingerprints** unchanged.
- Release evidence review correctly returns NO-GO with absent lockfile, original `.git` history, and full validation report.

## Not verified and release blockers

- Authentic `package-lock.json` is still missing; `npm ci` cannot run.
- Full build attempted but failed on missing dependencies and Node types.
- Live ClamAV clean/EICAR test failed here because no daemon was accessible.
- PostgreSQL RLS/migration, two-server HTTP, authenticated browser, restore, HTTPS and SSH/network checks were **not run** in this environment.
- Complete original Git-history secret scan and rotation of any exposed credentials remain required.

See `V53_KALI_VALIDATION.md`, `TEST_EVIDENCE_V53.md` and `V53_SECURITY_REPORT.md`.
