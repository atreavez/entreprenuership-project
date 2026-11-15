# AssetTrust v0.51 - Engineering handover

Checkpoint adds a dependency/lockfile supply-chain policy, a supervised validation runner with five explicit modes and sanitized stop-on-failure evidence, 17 new tests, CI coverage for v51, and full operator/security documentation. No database migrations or business logic were edited; existing RLS scope remains seven tables in source.

## Files

- `tools/supply-chain-policy-v51.cjs` - manifests, trusted HTTPS npm tarballs, genuine lockfile graph.
- `tools/release-validation-v51.cjs` - `--plan`, `--preflight`, `--validate`, `--database`, `--full`.
- `tools/tests-v51/release-supply-chain.test.cjs` - 17 security/fail-closed tests using temporary synthetic fixture packages; no production lockfile generated.
- `package.json` and both workspace manifests - `0.51.0` and seven new scripts.
- `.github/workflows/ci.yml` - v51 offline tests and read-only operator plan.
- `test-evidence/v51/*.log` - version suite logs, preflight status and observed failure evidence.
- `V51_KALI_VALIDATION.md`, `V51_SECURITY_REPORT.md`, `CHANGELOG_V51.md`.

## Verification

49/49 version checks pass; 17/17 new tests pass; architecture, syntax, CI and offline smoke pass; 25/25 migration hashes match. The real npm install, full build, PostgreSQL tests and full Git-history scan **were not completed**; the corresponding gates refuse or fail safely. Reproducible builds require an authentic npm lockfile from a connected and trusted package registry.

## Next operator action

On the user's connected Kali Linux machine, apply the v51 code to a clean branch of the canonical Git clone, generate and inspect a real lockfile, run the supervised `--validate` pipeline, then create a fresh local `assettrust_ci` or `assettrust_test` PostgreSQL/PostGIS test DB and run the explicitly approved `--database` pipeline. Upload the resulting JSON log and full validation outputs for independent review. Preserve migration history, customer data, keys and `.git` history.

**Release NO-GO.**
