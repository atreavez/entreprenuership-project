# AssetTrust v0.55 - Engineering handover

**Scope:** reproducible dependency bootstrap, authentic Git-history gating, accurate health version reporting, stronger CI ordering. No migrations or business workflow changes.

## Changed source

- `package.json`, `apps/api/package.json`, `apps/web/package.json`: synchronized version 0.55.0; new bootstrap and verification scripts.
- `tools/lockfile-bootstrap-v55.cjs`: dependency-free lockfile preparation policy and guarded actual npm resolution.
- `tools/tests-v55/lockfile-bootstrap-v55.test.cjs`: 16 tests, with the npm-resolution success paths explicitly simulated.
- `apps/api/src/main.ts`: runtime API version from installed API package metadata.
- `tools/release-validation-v51.cjs`: original Git clone path support in full release validation.
- `tools/validation-evidence-v53.cjs`: external canonical `.git` metadata allowed for evidence review, without automatic approval.
- `tools/tests-v54/history-v54.test.cjs`: future-compatible version expectation.
- `.github/workflows/ci.yml`: fail-closed v0.55 checks before `npm ci`, full version suite included.
- `test-evidence/v55`: suite logs, blocked operations, migration hashes and gate matrix.

## Why not bundle a lockfile?

Generating a fake resolved dependency graph would be unsafe. The runtime cannot connect to `registry.npmjs.org`; attempting real npm resolution did not complete. The operator must generate a genuine lockfile using npm on a connected trusted computer, inspect it, commit it, and run `npm ci` before the build can be considered reproducible.

## Security release decision

**NO-GO.** Only 3/11 read-only preflight prerequisites present in this checkpoint. Protected tenant RLS remains incomplete across all private tables; v0.46-v0.50 PostgreSQL policies have never been executed in a live test database in this environment. Mandatory ClamAV, full Git history, vulnerability audit, full build, end-to-end and deployment proofs are outstanding.

## Next operator actions

Follow `V55_KALI_VALIDATION.md` with a complete source backup and a dedicated disposable database. Preserve encryption/signing keys; do not run mutating tests on real user data. Supply actual Kali command output for debugging rather than starting another theoretical production gate.
