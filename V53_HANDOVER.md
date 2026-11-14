# AssetTrust v0.53 — engineering handover

## What changed

- Fixed **invalid GitHub Actions YAML** in two earlier PostgreSQL steps. The original v0.52 workflow did not parse.
- Added dependency-free Ruby/Psych YAML and CI coverage validator, invoked **before** `npm ci` in `.github/workflows/ci.yml`.
- Added 18 adversarial tests across `tools/tests-v53/`.
- Updated the v0.51 supervised test plan to include two real API processes and supervised HTTP integration tests in `--database` and `--full`, using run-scoped random ownership markers. Scope of work remains local disposable test DBs only.
- Added read-only result reviewer `tools/validation-evidence-v53.cjs`: checks exact stage sequence, successful exits, report permissions, source version, original history and genuine dependency lockfile. It cannot establish independent provenance or approve production.
- No schema change, no new migrations and no changes to user-visible platform behavior. Previous 25 migration files and their pinned hashes remain intact.

## New commands

```bash
npm run verify:v53          # offline 18-test suite
npm run verify:ci:v53       # real YAML parser and CI security policy
npm run evidence:review:v53 # checks completed full Kali execution; currently BLOCKS
npm run release:plan:v51    # read-only current plan, now 88 steps
npm run release:full:v51    # guarded live execution, Kali only
```

## Test result

51/51 version suites and 18/18 new checks PASS. 25/25 migration source hashes match. Architecture, syntax and source-secret scan PASS. Live ClamAV, authentic npm lockfile, clean build, PostgreSQL execution, Git-history scan, HTTPS, SSH/firewall and browser E2E **NOT PROVEN** here. Release **NO-GO**.

## Priority for the next milestone

Run the supervised release plan on the connected Kali test environment, obtain genuine lockfile and daemon evidence, repair any actual build/database/runtime failures, then extend RLS to remaining sensitive tables only after real cross-tenant tests. Do not issue an unconditional production approval from a green offline version-suite count.
