# AssetTrust v0.55 - Authentic lockfile bootstrap and deployment version integrity

**Date:** 11 November 2026. **Release decision: NO-GO.**

## Implemented

1. Added `tools/lockfile-bootstrap-v55.cjs` with a read-only `--check` and a separately authorized `--generate` mode. It invokes the real npm registry resolver with lifecycle scripts disabled, strict peer dependency resolution, and the public HTTPS npm registry. It refuses overwriting a lockfile, refuses production environments, refuses mismatched workspaces and unapproved manifest sources, checks every workspace manifest remained byte-identical, and checks the resulting dependency graph/integrity hashes with the existing v0.51/v0.17 policy. Failed generation cleans up only its freshly created regular lockfile.
2. Added `npm run lockfile:check:v55` and `ASSETTRUST_V55_CREATE_LOCKFILE=YES npm run lockfile:generate:v55` for the connected operator.
3. Updated API `/api/v1/healthz` to obtain its version from `apps/api/package.json` at runtime, eliminating stale `0.52.0` responses after new deployments. The source and compiled entrypoints each resolve the same package manifest.
4. Updated the supervised v0.51 runner to use v0.54's batched history scanner, supporting `ASSETTRUST_HISTORY_REPO=/absolute/path/to/original/clone`. The v0.53 evidence checker recognizes this external original clone. A `.git`-less ZIP is still NO-GO until a real original clone is scanned.
5. Wired v0.55 checks into CI *before* `npm ci`, and retained all historical version and live database contract checks. Revised v0.54's test that had frozen the package version to 0.54.0.
6. Added 16 new dependency-free tests, including simulated npm outcomes, lockfile integrity, manifest tampering, symlink safety, production refusal, CI ordering and external-history integration. No old migration was edited; no new SQL migration was introduced.

## Evidence and limitations

- 53/53 version verification commands passed; 16/16 new v0.55 tests passed.
- Architecture, syntax, CI policy, source scanner and offline smoke passed.
- 25/25 SQL migration source SHA-256 values match the immutable v0.54 archive.
- Real lockfile generation on this isolated runtime could not complete because npm registry access stalled. **There is no genuine package-lock.json and no successful npm ci/build**. The new tests mocked npm solely to test tool behavior, not to claim online installation.
- No live PostgreSQL, ClamAV, multi-server, browser, payment, HTTPS or original-repository security test completed here.

See `TEST_EVIDENCE_V55.md`, `V55_KALI_VALIDATION.md` and `V55_SECURITY_REPORT.md` before operating the code.
